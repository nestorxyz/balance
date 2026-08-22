-- Immutable, revisioned accounting month closes.
-- Preparation is read-only; the final close always requires an authenticated user action.

create table monthly_closes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  period date not null,
  revision integer not null check (revision > 0),
  transaction_fingerprint text not null,
  transaction_count integer not null,
  preflight jsonb not null,
  source_data jsonb not null,
  report_payload jsonb not null,
  closed_at timestamptz not null default now(),
  unique (user_id, period, revision)
);

create index idx_monthly_closes_user_period
  on monthly_closes(user_id, period desc, revision desc);

alter table monthly_closes enable row level security;

create policy "monthly_closes_select" on monthly_closes
  for select using ((select auth.uid()) = user_id);

-- No direct INSERT/UPDATE/DELETE policies. Creation goes through close_month;
-- closed accounting records are immutable.

create or replace function month_transaction_fingerprint(
  p_user_id uuid,
  p_period date
) returns text
language sql
stable
set search_path = public
as $$
  select md5(coalesce(string_agg(
    concat_ws('|', t.id::text, t.date::text, t.account_id::text, t.amount::text,
      t.type::text, coalesce(t.category, ''), coalesce(t.transfer_to::text, '')),
    E'\n' order by t.date, t.id
  ), ''))
  from transactions t
  join accounts a on a.id = t.account_id
  where t.user_id = p_user_id
    and a.entity = 'personal'
    and t.date >= p_period
    and t.date < (p_period + interval '1 month')::date;
$$;

create or replace function get_month_close_preflight(
  p_month text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_period date;
  v_end date;
  v_delta bigint := 0;
  v_uncategorized integer := 0;
  v_unpaired_transfers integer := 0;
  v_transaction_count integer := 0;
  v_fingerprint text;
  v_latest monthly_closes;
  v_period_ended boolean;
  v_ready boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid month %. Expected YYYY-MM', p_month;
  end if;

  v_period := (p_month || '-01')::date;
  v_end := (v_period + interval '1 month - 1 day')::date;
  v_period_ended := current_date > v_end;

  select coalesce((get_reconciliation_status('personal')->>'delta')::bigint, 0)
    into v_delta;

  select count(*) into v_uncategorized
  from transactions t
  join accounts a on a.id = t.account_id
  where t.user_id = v_user_id and a.entity = 'personal'
    and t.date between v_period and v_end
    and t.type in ('income', 'expense', 'refund')
    and t.category is null;

  select count(*) into v_unpaired_transfers
  from transactions t
  join accounts a on a.id = t.account_id
  where t.user_id = v_user_id and a.entity = 'personal'
    and t.date between v_period and v_end and t.type = 'transfer'
    and (t.transfer_to is null or not exists (
      select 1 from transactions counterpart
      where counterpart.user_id = t.user_id
        and counterpart.id <> t.id
        and counterpart.type = 'transfer'
        and counterpart.date = t.date
        and counterpart.account_id = t.transfer_to
        and counterpart.transfer_to = t.account_id
        and counterpart.amount = -t.amount
    ));

  select count(*) into v_transaction_count
  from transactions t join accounts a on a.id = t.account_id
  where t.user_id = v_user_id and a.entity = 'personal'
    and t.date between v_period and v_end;

  v_fingerprint := month_transaction_fingerprint(v_user_id, v_period);
  select * into v_latest from monthly_closes
  where user_id = v_user_id and period = v_period
  order by revision desc limit 1;

  v_ready := v_period_ended and v_delta = 0 and v_uncategorized = 0
    and v_unpaired_transfers = 0 and v_transaction_count > 0;

  return jsonb_build_object(
    'month', p_month,
    'period_end', v_end,
    'ready', v_ready,
    'fingerprint', v_fingerprint,
    'transaction_count', v_transaction_count,
    'state', case
      when v_latest.id is null then case when v_ready then 'ready' else 'open' end
      when v_latest.transaction_fingerprint = v_fingerprint then 'closed'
      else 'amendment_required'
    end,
    'latest_revision', coalesce(v_latest.revision, 0),
    'checks', jsonb_build_array(
      jsonb_build_object('id', 'period_ended', 'label', 'El mes terminó', 'passed', v_period_ended),
      jsonb_build_object('id', 'reconciled', 'label', 'Todas las cuentas están cuadradas', 'passed', v_delta = 0, 'value', v_delta),
      jsonb_build_object('id', 'categorized', 'label', 'No hay movimientos sin categoría', 'passed', v_uncategorized = 0, 'value', v_uncategorized),
      jsonb_build_object('id', 'transfers_paired', 'label', 'Las transferencias están emparejadas', 'passed', v_unpaired_transfers = 0, 'value', v_unpaired_transfers),
      jsonb_build_object('id', 'has_activity', 'label', 'El mes tiene movimientos', 'passed', v_transaction_count > 0, 'value', v_transaction_count)
    )
  );
end;
$$;

create or replace function close_month(
  p_month text,
  p_expected_fingerprint text,
  p_report_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_period date;
  v_end date;
  v_preflight jsonb;
  v_fingerprint text;
  v_revision integer;
  v_source_data jsonb;
  v_close monthly_closes;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not pg_try_advisory_xact_lock(hashtext('month_close_' || v_user_id::text || '_' || p_month)) then
    raise exception 'Another month close is in progress. Try again.';
  end if;

  v_preflight := get_month_close_preflight(p_month);
  if not coalesce((v_preflight->>'ready')::boolean, false) then
    raise exception 'Month % is not ready to close', p_month;
  end if;

  v_period := (p_month || '-01')::date;
  v_end := (v_period + interval '1 month - 1 day')::date;
  v_fingerprint := month_transaction_fingerprint(v_user_id, v_period);
  if p_expected_fingerprint is distinct from v_fingerprint then
    raise exception 'The ledger changed after preflight. Review it and try again.';
  end if;

  select coalesce(max(revision), 0) + 1 into v_revision
  from monthly_closes where user_id = v_user_id and period = v_period;

  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.name)
      from accounts a where a.user_id = v_user_id and not a.is_archived), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.name)
      from categories c where c.user_id = v_user_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.id)
      from transactions t join accounts a on a.id = t.account_id
      where t.user_id = v_user_id and a.entity = 'personal'
        and t.date between v_period and v_end), '[]'::jsonb)
  ) into v_source_data;

  insert into monthly_closes (
    user_id, period, revision, transaction_fingerprint, transaction_count,
    preflight, source_data, report_payload
  ) values (
    v_user_id, v_period, v_revision, v_fingerprint,
    (v_preflight->>'transaction_count')::integer, v_preflight, v_source_data,
    coalesce(p_report_payload, '{}'::jsonb)
  ) returning * into v_close;

  return to_jsonb(v_close);
end;
$$;

create or replace function get_month_close_history(
  p_limit integer default 24
) returns table (
  id uuid,
  period date,
  revision integer,
  transaction_fingerprint text,
  transaction_count integer,
  preflight jsonb,
  closed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select mc.id, mc.period, mc.revision, mc.transaction_fingerprint,
    mc.transaction_count, mc.preflight, mc.closed_at
  from monthly_closes mc
  where mc.user_id = (select auth.uid())
  order by mc.period desc, mc.revision desc
  limit least(greatest(p_limit, 1), 120);
$$;

create or replace function get_month_close(
  p_month text,
  p_revision integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date;
  v_close monthly_closes;
begin
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid month %. Expected YYYY-MM', p_month;
  end if;
  v_period := (p_month || '-01')::date;
  select * into v_close from monthly_closes mc
  where mc.user_id = (select auth.uid()) and mc.period = v_period
    and (p_revision is null or mc.revision = p_revision)
  order by mc.revision desc limit 1;
  if v_close.id is null then raise exception 'No close found for month %', p_month; end if;
  return to_jsonb(v_close);
end;
$$;

revoke all on function month_transaction_fingerprint(uuid, date) from public, anon, authenticated;
grant execute on function get_month_close_preflight(text) to authenticated;
grant execute on function close_month(text, text, jsonb) to authenticated;
grant execute on function get_month_close_history(integer) to authenticated;
grant execute on function get_month_close(text, integer) to authenticated;
