begin;
select plan(17);
insert into auth.users(id,email,encrypted_password,email_confirmed_at,role,aud,instance_id) values
('ba000000-0000-0000-0000-000000000001','budget-a@example.com',crypt('x',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
('ba000000-0000-0000-0000-000000000002','budget-b@example.com',crypt('x',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into accounts(id,user_id,name,type,subtype,entity,on_budget) values
('ba100000-0000-0000-0000-000000000001','ba000000-0000-0000-0000-000000000001','PEN','asset','debit','personal',true),
('ba100000-0000-0000-0000-000000000002','ba000000-0000-0000-0000-000000000001','Off','asset','debit','personal',false);
select set_config('request.jwt.claim.sub','ba000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select lives_ok($$select create_top_level_category('Bebé')$$,'creates category');
select is((select user_id from categories where name='Bebé'),'ba000000-0000-0000-0000-000000000001'::uuid,'owned category');
select lives_ok($$select create_subcategory((select id from categories where name='Bebé'),'budget.formula','Fórmula')$$,'creates subcategory');
select lives_ok($$select set_budget_income('2026-08-20',123456)$$,'planned income');
select lives_ok($$select set_budget_target('2026-08-01',(select id from categories where name='Bebé'),50000)$$,'target');
select lives_ok($$select set_budget_target('2026-08-01','budget.formula',30000)$$,'subcategory target');
select throws_ok($$select set_budget_target('2026-08-01',(select id from categories where name='Bebé'),-1)$$,'22023',null,'negative rejected');
select throws_ok($$select set_budget_target('2026-08-01','budget.formula',50001)$$,'23514',null,'children cannot exceed parent');
reset role;
insert into transactions(user_id,account_id,type,amount,description,category,entity,date) values
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','income',100000,'Income','ingreso','personal','2026-08-01'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','expense',30000,'Expense',(select id from categories where name='Bebé'),'personal','2026-08-02'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','refund',5000,'Refund',(select id from categories where name='Bebé'),'personal','2026-08-03'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','expense',9999,'Formula','budget.formula','personal','2026-08-04'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002','expense',7000,'Off budget',(select id from categories where name='Bebé'),'personal','2026-08-05');
set local role authenticated;
select is((get_monthly_budget('2026-08-01')->'categories'->0->>'spent')::bigint,34999::bigint,'parent rolls up child spending');
select is((get_monthly_budget('2026-08-01')->'categories'->0->'children'->0->>'spent')::bigint,9999::bigint,'child spending remains visible');
select is((get_monthly_budget('2026-08-01')->>'actual_available')::bigint,65001::bigint,'actual available includes all exact spending buckets');
select is((get_monthly_budget('2026-08-01')->>'planned_available')::bigint,73456::bigint,'planned available');
select is((get_monthly_budget('2026-08-01')->>'total_allocated')::bigint,50000::bigint,'child targets do not double count allocation');
select lives_ok($$select copy_budget('2026-08-01','2026-09-01')$$,'copy empty destination');
select throws_ok($$select copy_budget('2026-08-01','2026-09-01')$$,'23505',null,'overwrite protected');
select lives_ok($$select remove_budget_target('2026-08-01',(select id from categories where name='Bebé'))$$,'remove parent target');
select is((select count(*) from budget_targets bt join budget_plans bp on bp.id=bt.plan_id where bp.month='2026-08-01'),0::bigint,'removing parent removes child targets');
select * from finish();
rollback;
