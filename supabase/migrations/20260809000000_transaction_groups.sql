-- Optional transaction groups (for beneficiaries/projects such as Bebe, Nestor, Joshi).
-- Groups are intentionally independent from accounting categories.

create table transaction_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  entity entity_type not null default 'personal',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transaction_groups_user_entity_name_key
  on transaction_groups (user_id, entity, lower(name))
  where not is_archived;

alter table transaction_groups enable row level security;

create policy "transaction_groups_select" on transaction_groups
  for select using (user_id = (select auth.uid()));
create policy "transaction_groups_insert" on transaction_groups
  for insert with check (user_id = (select auth.uid()));
create policy "transaction_groups_update" on transaction_groups
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table transactions
  add column group_id uuid references transaction_groups(id) on delete restrict;

create index transactions_group_id_idx on transactions (group_id)
  where group_id is not null;

create or replace function create_transaction_group(
  p_name text,
  p_entity entity_type default 'personal'
) returns transaction_groups as $$
declare
  v_result transaction_groups;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if btrim(p_name) = '' then
    raise exception 'Group name cannot be empty' using errcode = '22023';
  end if;

  insert into transaction_groups (user_id, name, entity)
  values (auth.uid(), btrim(p_name), p_entity)
  returning * into v_result;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function rename_transaction_group(
  p_group_id uuid,
  p_name text
) returns transaction_groups as $$
declare
  v_result transaction_groups;
begin
  if btrim(p_name) = '' then
    raise exception 'Group name cannot be empty' using errcode = '22023';
  end if;

  update transaction_groups
  set name = btrim(p_name), updated_at = now()
  where id = p_group_id and user_id = auth.uid()
  returning * into v_result;
  if not found then
    raise exception 'Group not found or unauthorized' using errcode = '42501';
  end if;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function archive_transaction_group(p_group_id uuid)
returns transaction_groups as $$
declare
  v_result transaction_groups;
begin
  update transaction_groups
  set is_archived = true, updated_at = now()
  where id = p_group_id and user_id = auth.uid()
  returning * into v_result;
  if not found then
    raise exception 'Group not found or unauthorized' using errcode = '42501';
  end if;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

drop function if exists create_transaction(bigint, text, uuid, text, transaction_type, date);

create function create_transaction(
  p_amount bigint,
  p_category text,
  p_account_id uuid,
  p_description text,
  p_type transaction_type default null,
  p_date date default current_date,
  p_group_id uuid default null
) returns jsonb as $$
declare
  v_account accounts;
  v_group transaction_groups;
  v_tx transactions;
  v_store_amount bigint;
  v_balance_delta bigint;
begin
  select * into v_account from accounts
  where id = p_account_id and user_id = auth.uid();
  if not found then
    raise exception 'Account not found or unauthorized' using errcode = '42501';
  end if;

  if p_group_id is not null then
    select * into v_group from transaction_groups
    where id = p_group_id
      and user_id = auth.uid()
      and entity = v_account.entity
      and not is_archived;
    if not found then
      raise exception 'Group not found, archived, unauthorized, or belongs to another entity'
        using errcode = '42501';
    end if;
  end if;

  if p_type is null then
    p_type := case when p_amount >= 0 then 'income' else 'expense' end;
  end if;

  -- Adjustments keep their sign so ledger sums continue to match balances.
  v_store_amount := case when p_type = 'adjustment' then p_amount else abs(p_amount) end;
  v_balance_delta := case
    when p_type in ('income', 'refund') then abs(p_amount)
    when p_type = 'expense' then -abs(p_amount)
    else p_amount
  end;

  insert into transactions (
    user_id, account_id, type, amount, category, description, entity, date, group_id
  ) values (
    v_account.user_id, p_account_id, p_type, v_store_amount, p_category,
    p_description, v_account.entity, p_date, p_group_id
  ) returning * into v_tx;

  perform _update_account_balance(p_account_id, v_balance_delta);
  return to_jsonb(v_tx);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function create_transaction_group(text, entity_type) to authenticated;
grant execute on function rename_transaction_group(uuid, text) to authenticated;
grant execute on function archive_transaction_group(uuid) to authenticated;
grant execute on function create_transaction(bigint, text, uuid, text, transaction_type, date, uuid) to authenticated;
