-- Compatibility cleanup after category-aware clients are deployed.
drop function if exists create_transaction(bigint, text, uuid, text, transaction_type, date, uuid);
drop function if exists create_transaction_group(text, entity_type);
drop function if exists rename_transaction_group(uuid, text);
drop function if exists archive_transaction_group(uuid);
alter table transactions drop column if exists group_id;
drop table if exists transaction_groups;

create or replace function create_transaction(
  p_amount bigint, p_category text, p_account_id uuid, p_description text,
  p_type transaction_type default null, p_date date default current_date
) returns jsonb as $$
declare v_account accounts; v_tx transactions; v_store_amount bigint; v_balance_delta bigint;
begin
  select * into v_account from accounts where id=p_account_id and user_id=auth.uid();
  if not found then raise exception 'Account not found or unauthorized' using errcode='42501'; end if;
  if p_category is not null and not exists (select 1 from categories c where c.id=p_category and c.entity=v_account.entity
    and not c.is_archived and (c.user_id is null or c.user_id=auth.uid())) then
    raise exception 'Category not found, archived, or unauthorized' using errcode='42501';
  end if;
  if p_type is null then p_type := case when p_amount >= 0 then 'income' else 'expense' end; end if;
  v_store_amount := case when p_type='adjustment' then p_amount else abs(p_amount) end;
  v_balance_delta := case when p_type in ('income','refund') then abs(p_amount) when p_type='expense' then -abs(p_amount) else p_amount end;
  insert into transactions(user_id,account_id,type,amount,category,description,entity,date)
  values(v_account.user_id,p_account_id,p_type,v_store_amount,p_category,p_description,v_account.entity,p_date) returning * into v_tx;
  perform _update_account_balance(p_account_id,v_balance_delta);
  return to_jsonb(v_tx);
end;
$$ language plpgsql security definer set search_path=public;
grant execute on function create_transaction(bigint,text,uuid,text,transaction_type,date) to authenticated;
