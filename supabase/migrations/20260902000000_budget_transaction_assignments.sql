-- Flexible budget periods without mutating accounting dates or ledger entries.

create table budget_transaction_assignments (
  transaction_id uuid primary key references transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_month date check (budget_month is null or budget_month = date_trunc('month', budget_month)::date),
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_excluded and budget_month is null) or (not is_excluded and budget_month is not null))
);

alter table budget_transaction_assignments enable row level security;
create policy budget_transaction_assignments_all on budget_transaction_assignments for all
  using (user_id = (select auth.uid()) and exists (
    select 1 from transactions t where t.id = transaction_id and t.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from transactions t where t.id = transaction_id and t.user_id = (select auth.uid())
  ));

create or replace function set_transaction_budget_assignment(
  p_transaction_id uuid,
  p_month date default null,
  p_excluded boolean default false
) returns jsonb as $$
declare
  v_transaction transactions;
  v_month date;
begin
  select * into v_transaction from transactions
  where id = p_transaction_id and user_id = auth.uid();
  if not found then raise exception 'Transaction not found or unauthorized' using errcode = '42501'; end if;

  if p_excluded then
    v_month := null;
  else
    if p_month is null then raise exception 'Budget month is required' using errcode = '22023'; end if;
    v_month := date_trunc('month', p_month)::date;
  end if;

  insert into budget_transaction_assignments (transaction_id, user_id, budget_month, is_excluded)
  values (v_transaction.id, auth.uid(), v_month, p_excluded)
  on conflict (transaction_id) do update set
    budget_month = excluded.budget_month,
    is_excluded = excluded.is_excluded,
    updated_at = now();

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'accounting_date', v_transaction.date,
    'budget_month', v_month,
    'is_excluded', p_excluded,
    'is_explicit', true
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function reset_transaction_budget_assignment(p_transaction_id uuid)
returns jsonb as $$
declare v_transaction transactions;
begin
  select * into v_transaction from transactions
  where id = p_transaction_id and user_id = auth.uid();
  if not found then raise exception 'Transaction not found or unauthorized' using errcode = '42501'; end if;
  delete from budget_transaction_assignments
  where transaction_id = v_transaction.id and user_id = auth.uid();
  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'accounting_date', v_transaction.date,
    'budget_month', date_trunc('month', v_transaction.date)::date,
    'is_excluded', false,
    'is_explicit', false
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function get_budget_assignments(
  p_month date default null,
  p_accounting_month date default null,
  p_explicit_only boolean default false
) returns jsonb as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'transaction_id', t.id,
      'accounting_date', t.date,
      'description', t.description,
      'type', t.type,
      'amount', t.amount,
      'account_id', t.account_id,
      'category', t.category,
      'budget_month', case when a.is_excluded then null else coalesce(a.budget_month, date_trunc('month', t.date)::date) end,
      'is_excluded', coalesce(a.is_excluded, false),
      'is_explicit', a.transaction_id is not null
    ) order by t.date desc, t.created_at desc)
    from transactions t
    join accounts source on source.id = t.account_id
    left join accounts destination on destination.id = t.transfer_to
    left join budget_transaction_assignments a on a.transaction_id = t.id
    where t.user_id = auth.uid()
      and (t.type in ('income', 'expense', 'refund', 'adjustment', 'debt_payment') or (
        t.type = 'transfer' and t.amount < 0 and source.type = 'asset' and destination.type = 'liability'
      ))
      and (not p_explicit_only or a.transaction_id is not null)
      and (p_accounting_month is null or (
        t.date >= date_trunc('month', p_accounting_month)::date
        and t.date < (date_trunc('month', p_accounting_month)::date + interval '1 month')
      ))
      and (p_month is null or (
        not coalesce(a.is_excluded, false)
        and coalesce(a.budget_month, date_trunc('month', t.date)::date) = date_trunc('month', p_month)::date
      ))
  ), '[]'::jsonb);
end;
$$ language plpgsql security definer stable set search_path = public;

create or replace function get_monthly_budget(p_month date) returns jsonb as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_plan budget_plans;
  v_actual_income bigint;
  v_actual_spending bigint;
  v_actual_commitments bigint;
begin
  select * into v_plan from budget_plans where user_id = auth.uid() and month = v_month;

  select
    coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0),
    coalesce(sum(case when t.type = 'expense' then t.amount when t.type = 'refund' then -t.amount
      when t.type = 'adjustment' and t.description like 'Undo:%' then -t.amount else 0 end), 0)
  into v_actual_income, v_actual_spending
  from transactions t
  join accounts a on a.id = t.account_id
  left join budget_transaction_assignments ba on ba.transaction_id = t.id
  where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget
    and not coalesce(ba.is_excluded, false)
    and coalesce(ba.budget_month, date_trunc('month', t.date)::date) = v_month;

  select coalesce(sum(abs(t.amount)), 0) into v_actual_commitments
  from transactions t
  join accounts source on source.id = t.account_id
  left join accounts destination on destination.id = t.transfer_to
  left join budget_transaction_assignments ba on ba.transaction_id = t.id
  where t.user_id = auth.uid() and t.entity = 'personal' and (
      t.type = 'debt_payment' or (
        t.type = 'transfer' and t.amount < 0 and source.type = 'asset' and destination.type = 'liability'
      )
    )
    and not coalesce(ba.is_excluded, false)
    and coalesce(ba.budget_month, date_trunc('month', t.date)::date) = v_month;

  return jsonb_build_object(
    'month', v_month,
    'currency', 'PEN',
    'planned_income', coalesce(v_plan.planned_income, 0),
    'total_allocated', coalesce((select sum(bt.amount) from budget_targets bt join categories c on c.id = bt.category_id
      where bt.plan_id = v_plan.id and c.parent_id is null), 0),
    'planned_available', coalesce(v_plan.planned_income, 0) - coalesce((select sum(bt.amount)
      from budget_targets bt join categories c on c.id = bt.category_id
      where bt.plan_id = v_plan.id and c.parent_id is null), 0),
    'actual_income', v_actual_income,
    'actual_spending', v_actual_spending,
    'actual_commitments', v_actual_commitments,
    'actual_available', v_actual_income - v_actual_spending - v_actual_commitments,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', parent.id,
        'name', parent.name,
        'target', parent_target.amount,
        'spent', coalesce(parent_spending.spent, 0),
        'remaining', parent_target.amount - coalesce(parent_spending.spent, 0),
        'percentage_used', case when parent_target.amount = 0 then case when coalesce(parent_spending.spent, 0) = 0 then 0 else 100 end
          else round(coalesce(parent_spending.spent, 0)::numeric * 100 / parent_target.amount, 2) end,
        'children', coalesce(children.rows, '[]'::jsonb)
      ) order by parent.sort_order, parent.name)
      from budget_targets parent_target
      join categories parent on parent.id = parent_target.category_id and parent.parent_id is null
      left join lateral (
        select sum(case when t.type = 'expense' then t.amount when t.type = 'refund' then -t.amount
          when t.type = 'adjustment' and t.description like 'Undo:%' then -t.amount else 0 end) spent
        from transactions t join accounts a on a.id = t.account_id
        left join categories tx_category on tx_category.id = t.category
        left join budget_transaction_assignments ba on ba.transaction_id = t.id
        where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget
          and (t.category = parent.id or tx_category.parent_id = parent.id)
          and not coalesce(ba.is_excluded, false)
          and coalesce(ba.budget_month, date_trunc('month', t.date)::date) = v_month
      ) parent_spending on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'category_id', child.id,
          'name', child.name,
          'target', child_target.amount,
          'spent', coalesce(child_spending.spent, 0),
          'remaining', case when child_target.amount is null then null else child_target.amount - coalesce(child_spending.spent, 0) end,
          'percentage_used', case when child_target.amount is null then null when child_target.amount = 0 then
            case when coalesce(child_spending.spent, 0) = 0 then 0 else 100 end
            else round(coalesce(child_spending.spent, 0)::numeric * 100 / child_target.amount, 2) end
        ) order by child.sort_order, child.name) rows
        from categories child
        left join budget_targets child_target on child_target.plan_id = v_plan.id and child_target.category_id = child.id
        left join lateral (
          select sum(case when t.type = 'expense' then t.amount when t.type = 'refund' then -t.amount
            when t.type = 'adjustment' and t.description like 'Undo:%' then -t.amount else 0 end) spent
          from transactions t join accounts a on a.id = t.account_id
          left join budget_transaction_assignments ba on ba.transaction_id = t.id
          where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget and t.category = child.id
            and not coalesce(ba.is_excluded, false)
            and coalesce(ba.budget_month, date_trunc('month', t.date)::date) = v_month
        ) child_spending on true
        where child.parent_id = parent.id and not child.is_archived
      ) children on true
      where parent_target.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$ language plpgsql security definer stable set search_path = public;

revoke execute on function set_transaction_budget_assignment(uuid,date,boolean),
  reset_transaction_budget_assignment(uuid), get_budget_assignments(date,date,boolean) from public, anon;
grant execute on function set_transaction_budget_assignment(uuid,date,boolean),
  reset_transaction_budget_assignment(uuid), get_budget_assignments(date,date,boolean), get_monthly_budget(date) to authenticated;
