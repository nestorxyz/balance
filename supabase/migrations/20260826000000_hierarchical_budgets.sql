-- Hierarchical personal budgets: parent envelopes with optional child targets.

create or replace function create_subcategory(p_parent_id text, p_id text, p_name text)
returns categories as $$
declare
  v_parent categories;
  v_result categories;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if btrim(p_name) = '' then raise exception 'Category name cannot be empty' using errcode = '22023'; end if;

  select * into v_parent from categories
  where id = p_parent_id and parent_id is null and not is_archived
    and (user_id is null or user_id = auth.uid());
  if not found then
    raise exception 'Parent category not found or unauthorized' using errcode = '42501';
  end if;

  insert into categories (id, name, parent_id, entity, sort_order, user_id)
  values (p_id, btrim(p_name), p_parent_id, v_parent.entity,
    (select coalesce(max(sort_order), 0) + 1 from categories where parent_id = p_parent_id), auth.uid())
  returning * into v_result;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, extensions;

create or replace function set_budget_target(p_month date, p_category_id text, p_amount bigint)
returns budget_targets as $$
declare
  v_plan_id uuid;
  v_result budget_targets;
  v_category categories;
  v_parent_target bigint;
  v_children_total bigint;
begin
  if p_amount < 0 then raise exception 'Budget target cannot be negative' using errcode = '22023'; end if;

  select * into v_category from categories
  where id = p_category_id and entity = 'personal' and not is_archived
    and (user_id is null or user_id = auth.uid());
  if not found then
    raise exception 'Personal category not found or unauthorized' using errcode = '42501';
  end if;

  insert into budget_plans (user_id, month) values (auth.uid(), date_trunc('month', p_month)::date)
  on conflict (user_id, month) do update set updated_at = now() returning id into v_plan_id;

  if v_category.parent_id is not null then
    select amount into v_parent_target from budget_targets
    where plan_id = v_plan_id and category_id = v_category.parent_id;
    if v_parent_target is null then
      raise exception 'Set the parent category budget before its subcategories' using errcode = '23514';
    end if;
    select coalesce(sum(amount), 0) into v_children_total
    from budget_targets bt join categories c on c.id = bt.category_id
    where bt.plan_id = v_plan_id and c.parent_id = v_category.parent_id
      and bt.category_id <> p_category_id;
    if v_children_total + p_amount > v_parent_target then
      raise exception 'Subcategory targets cannot exceed the parent category budget' using errcode = '23514';
    end if;
  else
    select coalesce(sum(amount), 0) into v_children_total
    from budget_targets bt join categories c on c.id = bt.category_id
    where bt.plan_id = v_plan_id and c.parent_id = p_category_id;
    if v_children_total > p_amount then
      raise exception 'Parent category budget cannot be lower than its subcategory targets' using errcode = '23514';
    end if;
  end if;

  insert into budget_targets (plan_id, category_id, amount) values (v_plan_id, p_category_id, p_amount)
  on conflict (plan_id, category_id) do update set amount = excluded.amount, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, extensions;

create or replace function remove_budget_target(p_month date, p_category_id text) returns void as $$
declare v_plan_id uuid;
begin
  select id into v_plan_id from budget_plans
  where user_id = auth.uid() and month = date_trunc('month', p_month)::date;
  if v_plan_id is null then return; end if;

  delete from budget_targets bt using categories c
  where bt.plan_id = v_plan_id and bt.category_id = c.id and c.parent_id = p_category_id;
  delete from budget_targets where plan_id = v_plan_id and category_id = p_category_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function get_monthly_budget(p_month date) returns jsonb as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_plan budget_plans;
  v_actual_income bigint;
  v_actual_spending bigint;
begin
  select * into v_plan from budget_plans where user_id = auth.uid() and month = v_month;
  select coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0),
    coalesce(sum(case when t.type = 'expense' then t.amount when t.type = 'refund' then -t.amount
      when t.type = 'adjustment' and t.description like 'Undo:%' then -t.amount else 0 end), 0)
  into v_actual_income, v_actual_spending from transactions t join accounts a on a.id = t.account_id
  where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget
    and t.date >= v_month and t.date < (v_month + interval '1 month');

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
    'actual_available', v_actual_income - v_actual_spending,
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
        where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget
          and (t.category = parent.id or tx_category.parent_id = parent.id)
          and t.date >= v_month and t.date < (v_month + interval '1 month')
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
          where t.user_id = auth.uid() and t.entity = 'personal' and a.on_budget and t.category = child.id
            and t.date >= v_month and t.date < (v_month + interval '1 month')
        ) child_spending on true
        where child.parent_id = parent.id and not child.is_archived
      ) children on true
      where parent_target.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$ language plpgsql security definer stable set search_path = public;

grant execute on function create_subcategory(text,text,text), set_budget_target(date,text,bigint),
  remove_budget_target(date,text), get_monthly_budget(date) to authenticated;
