-- Advance contributions: no income at receipt; expense offset only at settlement.
-- All amounts are PEN minor units. A dedicated on-budget payable holds each advance.
create table shared_contributions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  contributor text not null check (length(trim(contributor)) between 1 and 120),
  description text not null check (length(trim(description)) between 1 and 240),
  category_id text not null references categories(id),
  amount bigint not null check (amount > 0 and amount <= 9007199254740991),
  notice_date date not null,
  due_date date not null check (due_date >= notice_date),
  liability_account_id uuid not null unique references accounts(id),
  status text not null default 'pending' check (status in ('pending','received','applied','returned','cancelled')),
  received_date date,
  created_at timestamptz not null default now()
);
create table contribution_events (
  id uuid primary key,
  contribution_id uuid not null references shared_contributions(id),
  user_id uuid not null references auth.users(id),
  action text not null check (action in ('receive','settle','return','cancel')),
  date date not null,
  account_id uuid references accounts(id),
  bill_amount bigint,
  transaction_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index contribution_owner_due on shared_contributions(user_id, due_date);
create index contribution_event_owner on contribution_events(user_id, contribution_id);
alter table shared_contributions enable row level security;
alter table contribution_events enable row level security;
create policy contributions_read on shared_contributions for select to authenticated using ((select auth.uid()) = user_id);
create policy contribution_events_read on contribution_events for select to authenticated using ((select auth.uid()) = user_id);
revoke all on shared_contributions, contribution_events from anon, authenticated;
grant select on shared_contributions, contribution_events to authenticated;
grant select on shared_contributions, contribution_events to service_role;
create trigger contributions_audit after insert or update on shared_contributions for each row execute function audit_trigger_fn();
create trigger contribution_events_audit after insert on contribution_events for each row execute function audit_trigger_fn();

create function create_shared_contribution(
  p_id uuid, p_contributor text, p_description text, p_category_id text,
  p_amount bigint, p_notice_date date, p_due_date date
) returns shared_contributions language plpgsql security definer set search_path=public as $$
declare v_row shared_contributions; v_account uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is null then raise exception 'Request id required' using errcode='22023'; end if;
  -- Serialize identical client requests before creating the holding account.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_row from shared_contributions where id=p_id;
  if found then
    if v_row.user_id <> v_uid then raise exception 'Not authorized' using errcode='42501'; end if;
    if (v_row.contributor,v_row.description,v_row.category_id,v_row.amount,v_row.notice_date,v_row.due_date)
      is distinct from (trim(p_contributor),trim(p_description),p_category_id,p_amount,p_notice_date,p_due_date) then
      raise exception 'Request id reused with different data' using errcode='22023';
    end if;
    return v_row;
  end if;
  if not exists(select 1 from categories where id=p_category_id and entity='personal'
    and not is_archived and (user_id is null or user_id=v_uid)) then
    raise exception 'Category unavailable' using errcode='42501';
  end if;
  insert into accounts(user_id,name,type,subtype,entity,currency,balance,on_budget,metadata)
  values(v_uid,'Aporte: ' || trim(p_contributor) || ' · ' || p_id::text,'liability','payable','personal','PEN',0,true,
    jsonb_build_object('shared_contribution_id',p_id)) returning id into v_account;
  insert into shared_contributions(id,user_id,contributor,description,category_id,amount,notice_date,due_date,liability_account_id)
  values(p_id,v_uid,trim(p_contributor),trim(p_description),p_category_id,p_amount,p_notice_date,p_due_date,v_account)
  returning * into v_row;
  return v_row;
end;
$$;

-- Private primitive: insert and balance update in the caller's SQL transaction.
create function _contribution_post(p_row shared_contributions, p_account uuid, p_type transaction_type,
  p_amount bigint, p_delta bigint, p_category text, p_description text, p_date date, p_peer uuid default null)
returns uuid language plpgsql set search_path=public as $$
declare v_id uuid;
begin
  insert into transactions(user_id,account_id,type,amount,category,description,entity,date,transfer_to,metadata)
  values(p_row.user_id,p_account,p_type,p_amount,p_category,p_description,'personal',p_date,p_peer,
    jsonb_build_object('shared_contribution_id',p_row.id)) returning id into v_id;
  perform _update_account_balance(p_account,p_delta);
  return v_id;
end;
$$;

create function act_on_contribution(p_id uuid,p_request_id uuid,p_action text,p_date date,
  p_account_id uuid default null,p_bill_amount bigint default null)
returns contribution_events language plpgsql security definer set search_path=public as $$
declare
  v_row shared_contributions; v_event contribution_events; v_account accounts; v_holding accounts;
  v_ids uuid[] := '{}'; v_uid uuid := auth.uid(); v_label text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Request id required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_event from contribution_events where id=p_request_id;
  if found then
    if v_event.user_id <> v_uid then raise exception 'Not authorized' using errcode='42501'; end if;
    if (v_event.contribution_id,v_event.action,v_event.date,v_event.account_id,v_event.bill_amount)
      is distinct from (p_id,p_action,p_date,p_account_id,p_bill_amount) then
      raise exception 'Request id reused with different data' using errcode='22023';
    end if;
    return v_event;
  end if;
  select * into v_row from shared_contributions where id=p_id and user_id=v_uid for update;
  if not found then raise exception 'Contribution unavailable' using errcode='42501'; end if;
  if p_action is null or p_action not in ('receive','settle','return','cancel') then
    raise exception 'Invalid action' using errcode='22023';
  end if;
  if p_date is null or p_date < v_row.notice_date or p_date > (now() at time zone 'America/Lima')::date
    or (v_row.received_date is not null and p_date < v_row.received_date) then
    raise exception 'Invalid operation date' using errcode='22023';
  end if;
  if (p_action in ('receive','cancel') and v_row.status <> 'pending')
    or (p_action in ('settle','return') and v_row.status <> 'received') then
    raise exception 'Operation not allowed in current state' using errcode='23514';
  end if;
  if p_action='settle' then
    if p_bill_amount is null or p_bill_amount < v_row.amount or p_bill_amount > 9007199254740991 then
      raise exception 'Bill must cover the contribution' using errcode='22023';
    end if;
  elsif p_bill_amount is not null then raise exception 'Bill amount only for settlement' using errcode='22023';
  end if;
  if p_action='cancel' then
    if p_account_id is not null then raise exception 'Cancel does not move money' using errcode='22023'; end if;
  else
    -- Lock accounts in a stable order, including the holding account.
    perform 1 from accounts where id in (p_account_id,v_row.liability_account_id) order by id for update;
    select * into v_account from accounts where id=p_account_id and user_id=v_uid;
    if not found or v_account.is_archived or not v_account.on_budget or v_account.entity <> 'personal'
      or v_account.currency <> 'PEN' or v_account.type <> 'asset' or v_account.subtype not in ('debit','cash') then
      raise exception 'Choose an active personal PEN cash or bank account' using errcode='42501';
    end if;
    select * into v_holding from accounts where id=v_row.liability_account_id;
    if v_holding.user_id <> v_uid or v_holding.type <> 'liability' or v_holding.subtype <> 'payable'
      or v_holding.is_archived or not v_holding.on_budget or v_holding.currency <> 'PEN'
      or v_holding.balance <> (case when v_row.status='received' then -v_row.amount else 0 end) then
      raise exception 'Holding account inconsistent; reconcile before continuing' using errcode='23514';
    end if;
    v_label := v_row.description || ' · ' || v_row.contributor;
    if p_action='receive' then
      v_ids := array[
        _contribution_post(v_row,v_row.liability_account_id,'transfer',-v_row.amount,-v_row.amount,null,'Anticipo recibido: '||v_label,p_date,p_account_id),
        _contribution_post(v_row,p_account_id,'transfer',v_row.amount,v_row.amount,null,'Anticipo recibido: '||v_label,p_date,v_row.liability_account_id)];
    elsif p_action='return' then
      v_ids := array[
        _contribution_post(v_row,p_account_id,'transfer',-v_row.amount,-v_row.amount,null,'Anticipo devuelto: '||v_label,p_date,v_row.liability_account_id),
        _contribution_post(v_row,v_row.liability_account_id,'transfer',v_row.amount,v_row.amount,null,'Anticipo devuelto: '||v_label,p_date,p_account_id)];
    else
      if not exists(select 1 from categories where id=v_row.category_id and not is_archived
        and entity='personal' and (user_id is null or user_id=v_uid)) then
        raise exception 'Category unavailable' using errcode='42501';
      end if;
      v_ids := array[
        _contribution_post(v_row,p_account_id,'expense',p_bill_amount,-p_bill_amount,v_row.category_id,'Recibo compartido: '||v_label,p_date),
        _contribution_post(v_row,v_row.liability_account_id,'refund',v_row.amount,v_row.amount,v_row.category_id,'Aporte aplicado: '||v_label,p_date)];
    end if;
  end if;
  update shared_contributions set status=case p_action when 'receive' then 'received' when 'settle' then 'applied'
    when 'return' then 'returned' else 'cancelled' end,
    received_date=case when p_action='receive' then p_date else received_date end where id=p_id;
  insert into contribution_events(id,contribution_id,user_id,action,date,account_id,bill_amount,transaction_ids)
  values(p_request_id,p_id,v_uid,p_action,p_date,p_account_id,p_bill_amount,v_ids) returning * into v_event;
  return v_event;
end;
$$;

-- Individual undo would leave the contribution's obligation inconsistent.
alter function undo_transaction(uuid) rename to _undo_transaction_before_contributions;
revoke all on function _undo_transaction_before_contributions(uuid) from public,anon,authenticated;
create function undo_transaction(p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if exists(select 1 from transactions where id=p_transaction_id and user_id=auth.uid()
    and metadata ? 'shared_contribution_id') then
    raise exception 'Shared contributions cannot be undone individually; use the contribution workflow' using errcode='23514';
  end if;
  return _undo_transaction_before_contributions(p_transaction_id);
end;
$$;
revoke all on function create_shared_contribution(uuid,text,text,text,bigint,date,date),
  act_on_contribution(uuid,uuid,text,date,uuid,bigint),
  _contribution_post(shared_contributions,uuid,transaction_type,bigint,bigint,text,text,date,uuid),
  undo_transaction(uuid) from public,anon,authenticated;
grant execute on function create_shared_contribution(uuid,text,text,text,bigint,date,date),
  act_on_contribution(uuid,uuid,text,date,uuid,bigint),undo_transaction(uuid) to authenticated;

create function list_shared_contributions() returns jsonb
language sql stable security invoker set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('events',
    (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]'::jsonb)
      from contribution_events e where e.contribution_id=c.id)) order by c.due_date desc),'[]'::jsonb)
  from shared_contributions c where c.user_id=auth.uid();
$$;
revoke all on function list_shared_contributions() from public,anon;
grant execute on function list_shared_contributions() to authenticated;
