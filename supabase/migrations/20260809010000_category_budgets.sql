-- User-owned categories and monthly personal PEN budgets.
alter table categories add column if not exists is_archived boolean not null default false;

create unique index if not exists categories_user_entity_name_active_key
  on categories (user_id, entity, lower(name))
  where user_id is not null and not is_archived;

create table budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  planned_income bigint not null default 0 check (planned_income >= 0),
  currency text not null default 'PEN' check (currency = 'PEN'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table budget_targets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references budget_plans(id) on delete cascade,
  category_id text not null references categories(id) on delete restrict,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, category_id)
);

alter table budget_plans enable row level security;
alter table budget_targets enable row level security;
create policy budget_plans_all on budget_plans for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budget_targets_all on budget_targets for all
  using (exists (select 1 from budget_plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from budget_plans p where p.id = plan_id and p.user_id = (select auth.uid())));

-- Promote each group to a stable category and preserve all group assignments.
insert into categories (id, name, parent_id, entity, sort_order, user_id)
select 'group:' || g.id::text, g.name, null, g.entity,
       1000 + row_number() over (partition by g.user_id, g.entity order by g.created_at), g.user_id
from transaction_groups g
on conflict (id) do nothing;

update transactions t set category = 'group:' || t.group_id::text
where t.group_id is not null;

-- Nestor belongs beside the migrated Bebé/Joshi categories, but starts empty.
insert into categories (id, name, parent_id, entity, sort_order, user_id)
select 'user:' || g.user_id::text || ':nestor', 'Nestor', null, 'personal', 1100, g.user_id
from transaction_groups g
where g.entity = 'personal' and lower(translate(g.name, 'éÉ', 'eE')) in ('bebe', 'joshi')
  and not exists (
    select 1 from categories c
    where c.user_id = g.user_id and c.entity = 'personal' and lower(c.name) = 'nestor'
  )
group by g.user_id
on conflict (id) do nothing;

create or replace function create_top_level_category(p_name text)
returns categories as $$
declare v_result categories;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if btrim(p_name) = '' then raise exception 'Category name cannot be empty' using errcode = '22023'; end if;
  insert into categories (id, name, parent_id, entity, sort_order, user_id)
  values ('user:' || auth.uid()::text || ':' || gen_random_uuid()::text, btrim(p_name), null, 'personal',
    (select coalesce(max(sort_order), 0) + 1 from categories where entity = 'personal' and parent_id is null), auth.uid())
  returning * into v_result;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, extensions;

create or replace function archive_category(p_category_id text) returns categories as $$
declare v_result categories;
begin
  update categories set is_archived = true where id = p_category_id and user_id = auth.uid()
  returning * into v_result;
  if not found then raise exception 'Category not found or unauthorized' using errcode = '42501'; end if;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_budget_income(p_month date, p_amount bigint) returns budget_plans as $$
declare v_result budget_plans; v_month date := date_trunc('month', p_month)::date;
begin
  if p_amount < 0 then raise exception 'Planned income cannot be negative' using errcode = '22023'; end if;
  insert into budget_plans (user_id, month, planned_income) values (auth.uid(), v_month, p_amount)
  on conflict (user_id, month) do update set planned_income = excluded.planned_income, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_budget_target(p_month date, p_category_id text, p_amount bigint)
returns budget_targets as $$
declare v_plan_id uuid; v_result budget_targets;
begin
  if p_amount < 0 then raise exception 'Budget target cannot be negative' using errcode = '22023'; end if;
  if not exists (select 1 from categories where id = p_category_id and entity = 'personal'
    and parent_id is null and not is_archived and (user_id is null or user_id = auth.uid())) then
    raise exception 'Top-level personal category not found or unauthorized' using errcode = '42501';
  end if;
  insert into budget_plans (user_id, month) values (auth.uid(), date_trunc('month', p_month)::date)
  on conflict (user_id, month) do update set updated_at = now() returning id into v_plan_id;
  insert into budget_targets (plan_id, category_id, amount) values (v_plan_id, p_category_id, p_amount)
  on conflict (plan_id, category_id) do update set amount = excluded.amount, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function remove_budget_target(p_month date, p_category_id text) returns void as $$
begin
  delete from budget_targets t using budget_plans p
  where t.plan_id = p.id and p.user_id = auth.uid()
    and p.month = date_trunc('month', p_month)::date and t.category_id = p_category_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function copy_budget(p_from date, p_to date, p_replace boolean default false) returns void as $$
declare v_from uuid; v_to uuid; v_count int;
begin
  select id into v_from from budget_plans where user_id = auth.uid() and month = date_trunc('month', p_from)::date;
  if v_from is null then raise exception 'Source budget does not exist' using errcode = 'P0002'; end if;
  insert into budget_plans (user_id, month) values (auth.uid(), date_trunc('month', p_to)::date)
    on conflict (user_id, month) do update set updated_at = now() returning id into v_to;
  select count(*) into v_count from budget_targets where plan_id = v_to;
  if (v_count > 0 or (select planned_income from budget_plans where id = v_to) > 0) and not p_replace then
    raise exception 'Destination budget is populated; use replace' using errcode = '23505';
  end if;
  if p_replace then delete from budget_targets where plan_id = v_to; end if;
  update budget_plans d set planned_income = s.planned_income, updated_at = now()
    from budget_plans s where d.id = v_to and s.id = v_from;
  insert into budget_targets (plan_id, category_id, amount)
    select v_to, category_id, amount from budget_targets where plan_id = v_from
    on conflict (plan_id, category_id) do update set amount = excluded.amount, updated_at = now();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function get_monthly_budget(p_month date) returns jsonb as $$
declare v_month date := date_trunc('month', p_month)::date; v_plan budget_plans; v_actual_income bigint; v_actual_spending bigint;
begin
  select * into v_plan from budget_plans where user_id = auth.uid() and month = v_month;
  select coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0),
    coalesce(sum(case when t.type = 'expense' then t.amount when t.type = 'refund' then -t.amount
      when t.type = 'adjustment' and t.description like 'Undo:%' then -t.amount else 0 end), 0)
  into v_actual_income, v_actual_spending from transactions t join accounts a on a.id = t.account_id
  where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget
    and t.date >= v_month and t.date < (v_month + interval '1 month');
  return jsonb_build_object('month', v_month, 'currency', 'PEN', 'planned_income', coalesce(v_plan.planned_income, 0),
    'total_allocated', coalesce((select sum(amount) from budget_targets where plan_id = v_plan.id), 0),
    'planned_available', coalesce(v_plan.planned_income, 0) - coalesce((select sum(amount) from budget_targets where plan_id = v_plan.id), 0),
    'actual_income', v_actual_income, 'actual_spending', v_actual_spending, 'actual_available', v_actual_income - v_actual_spending,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category_id', c.id, 'name', c.name, 'target', bt.amount,
      'spent', coalesce(s.spent, 0), 'remaining', bt.amount - coalesce(s.spent, 0),
      'percentage_used', case when bt.amount = 0 then case when coalesce(s.spent,0)=0 then 0 else 100 end else round(coalesce(s.spent,0)::numeric * 100 / bt.amount, 2) end) order by c.sort_order, c.name)
      from budget_targets bt join categories c on c.id = bt.category_id
      left join lateral (select sum(case when t.type='expense' then t.amount when t.type='refund' then -t.amount
        when t.type='adjustment' and t.description like 'Undo:%' then -t.amount else 0 end) spent
        from transactions t join accounts a on a.id=t.account_id where t.user_id=auth.uid() and t.entity='personal' and a.on_budget
          and t.category=c.id and t.date>=v_month and t.date<(v_month+interval '1 month')) s on true
      where bt.plan_id = v_plan.id), '[]'::jsonb));
end;
$$ language plpgsql security definer stable set search_path = public;

grant execute on function create_top_level_category(text), archive_category(text), set_budget_income(date,bigint),
  set_budget_target(date,text,bigint), remove_budget_target(date,text), copy_budget(date,date,boolean), get_monthly_budget(date) to authenticated;
