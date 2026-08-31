-- Run only against an EMPTY throwaway PostgreSQL database, never a linked project.
-- Minimal Supabase auth shim; financial tables/functions below are real migrations.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end; $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
\ir ../../supabase/migrations/00001_enums.sql
\ir ../../supabase/migrations/00003_categories.sql
\ir ../../supabase/migrations/00004_accounts.sql
\ir ../../supabase/migrations/00005_transactions.sql
\ir ../../supabase/migrations/00006_audit_log.sql
\ir ../../supabase/migrations/00007_primitives.sql
\ir ../../supabase/migrations/00008_operations.sql
\ir ../../supabase/migrations/00010_categories_user.sql
\ir ../../supabase/migrations/20260809000000_transaction_groups.sql
\ir ../../supabase/migrations/20260809010000_category_budgets.sql
\ir ../../supabase/migrations/20260809020000_remove_transaction_groups.sql
\ir ../../supabase/migrations/20260826000000_hierarchical_budgets.sql
\ir ../../supabase/migrations/20260831000000_shared_contributions.sql

create function test_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end;
$$;
create function test_reject(statement text,expected_state text,label text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate=expected_state then raise notice 'PASS: %',label; return; end if;
    raise;
  end;
  raise exception 'FAIL: % (operation succeeded)',label;
end;
$$;
insert into auth.users values('aa000000-0000-0000-0000-000000000001'),('aa000000-0000-0000-0000-000000000002');
insert into categories(id,name,entity,user_id) values('test.luz','Luz','personal','aa000000-0000-0000-0000-000000000001');
insert into accounts(id,user_id,name,type,subtype,entity,currency,on_budget) values
('bb000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','Bank','asset','debit','personal','PEN',true),
('bb000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','Cash','asset','cash','personal','PEN',true),
('bb000000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','USD','asset','debit','personal','USD',true),
('bb000000-0000-0000-0000-000000000004','aa000000-0000-0000-0000-000000000002','Other user','asset','debit','personal','PEN',true);
select set_config('request.jwt.claim.sub','aa000000-0000-0000-0000-000000000001',false);
set role authenticated;
select create_shared_contribution('cc000000-0000-0000-0000-000000000001','Neighbor','July light','test.luz',3000,'2026-07-20','2026-07-27');
select test_assert((select count(*)=0 from transactions),'pending request has no ledger impact');
select create_shared_contribution('cc000000-0000-0000-0000-000000000001','Neighbor','July light','test.luz',3000,'2026-07-20','2026-07-27');
select test_assert((select count(*)=1 from shared_contributions),'create is idempotent');
select test_reject($$select create_shared_contribution('cc000000-0000-0000-0000-000000000001','Neighbor','July light','test.luz',4000,'2026-07-20','2026-07-27')$$,'22023','create payload conflict rejected');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'receive','2026-07-25','bb000000-0000-0000-0000-000000000003')$$,'42501','wrong currency rejected');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'receive','2026-07-25','bb000000-0000-0000-0000-000000000004')$$,'42501','other owner account rejected');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'receive','2099-01-01','bb000000-0000-0000-0000-000000000001')$$,'22023','future cash movement rejected');
select act_on_contribution('cc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','receive','2026-07-25','bb000000-0000-0000-0000-000000000001');
select test_assert((select balance=3000 from accounts where name='Bank'),'receipt credits actual bank');
select test_assert((select balance=-3000 from accounts where id=(select liability_account_id from shared_contributions limit 1)),'receipt creates matching obligation');
select test_assert((get_monthly_budget('2026-07-01')->>'actual_available')::bigint=0,'advance is not available budget or income');
select act_on_contribution('cc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','receive','2026-07-25','bb000000-0000-0000-0000-000000000001');
select test_assert((select count(*)=2 from transactions),'retry creates no duplicate transactions');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000001','receive','2026-07-26','bb000000-0000-0000-0000-000000000001')$$,'22023','reused key different payload rejected');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'receive','2026-07-25','bb000000-0000-0000-0000-000000000001')$$,'23514','second receipt rejected even with new key');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'settle','2026-08-01','bb000000-0000-0000-0000-000000000001',2000)$$,'22023','bill smaller than advance rejected');
select test_assert((select count(*)=2 from transactions),'failed settlement is atomic');
select act_on_contribution('cc000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-000000000002','settle','2026-08-01','bb000000-0000-0000-0000-000000000001',10000);
select test_assert((select balance=-7000 from accounts where name='Bank'),'bank reflects full bill payment');
select test_assert((select balance=0 from accounts where id=(select liability_account_id from shared_contributions limit 1)),'settlement clears obligation');
select test_assert((get_monthly_budget('2026-08-01')->>'actual_spending')::bigint=7000,'only own share affects payment month');
select test_assert((get_monthly_budget('2026-07-01')->>'actual_spending')::bigint=0,'prior month has no premature refund');
select test_reject($$select undo_transaction((select id from transactions where type='expense' limit 1))$$,'23514','individual undo blocked');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'settle','2026-08-01','bb000000-0000-0000-0000-000000000001',10000)$$,'23514','bill cannot be applied twice');
select create_shared_contribution('cc000000-0000-0000-0000-000000000002','Neighbor','Return case','test.luz',3000,'2026-08-20','2026-08-27');
select act_on_contribution('cc000000-0000-0000-0000-000000000002',gen_random_uuid(),'receive','2026-08-21','bb000000-0000-0000-0000-000000000002');
select act_on_contribution('cc000000-0000-0000-0000-000000000002',gen_random_uuid(),'return','2026-08-22','bb000000-0000-0000-0000-000000000002');
select test_assert((select balance=0 from accounts where name='Cash'),'return restores cash without expense');
select test_assert((get_monthly_budget('2026-08-01')->>'actual_spending')::bigint=7000,'return does not change budget');
select create_shared_contribution('cc000000-0000-0000-0000-000000000003','Neighbor','Cancel case','test.luz',3000,'2026-08-20','2026-08-27');
select act_on_contribution('cc000000-0000-0000-0000-000000000003',gen_random_uuid(),'cancel','2026-08-22');
select test_assert((select count(*)=8 from transactions),'cancel does not post transactions');
select test_assert((select sum(balance) from accounts)=(select sum(case when type in ('income','refund','adjustment') then amount when type='expense' then -amount else 0 end) from transactions),'final ledger delta zero');
select test_reject($$update shared_contributions set amount=9999$$,'42501','direct record mutation denied');
select test_reject($$delete from contribution_events$$,'42501','event history cannot be deleted');
select test_reject($$select _undo_transaction_before_contributions((select id from transactions limit 1))$$,'42501','private undo cannot bypass guard');
select set_config('request.jwt.claim.sub','aa000000-0000-0000-0000-000000000002',false);
select test_assert(jsonb_array_length(list_shared_contributions())=0,'RLS hides other owners contributions and events');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'receive','2026-08-22','bb000000-0000-0000-0000-000000000004')$$,'42501','foreign contribution operation denied');
select test_reject($$select create_shared_contribution(gen_random_uuid(),'Neighbor','Private category','test.luz',1000,'2026-08-20','2026-08-27')$$,'42501','foreign category denied');
reset role;
set role anon;
select test_reject($$select list_shared_contributions()$$,'42501','anonymous read denied');
select test_reject($$select act_on_contribution('cc000000-0000-0000-0000-000000000001',gen_random_uuid(),'cancel','2026-08-22')$$,'42501','anonymous write denied');
reset role;
