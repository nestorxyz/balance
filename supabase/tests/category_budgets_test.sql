begin;
select plan(10);
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
select lives_ok($$select set_budget_income('2026-08-20',123456)$$,'planned income');
select lives_ok($$select set_budget_target('2026-08-01',(select id from categories where name='Bebé'),50000)$$,'target');
select throws_ok($$select set_budget_target('2026-08-01',(select id from categories where name='Bebé'),-1)$$,'22023',null,'negative rejected');
reset role;
insert into transactions(user_id,account_id,type,amount,description,category,entity,date) values
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','income',100000,'Income','ingreso','personal','2026-08-01'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','expense',30000,'Expense',(select id from categories where name='Bebé'),'personal','2026-08-02'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','refund',5000,'Refund',(select id from categories where name='Bebé'),'personal','2026-08-03'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000001','expense',9999,'Independent child',(select id from categories where name='Bebé')||'.child','personal','2026-08-04'),
('ba000000-0000-0000-0000-000000000001','ba100000-0000-0000-0000-000000000002','expense',7000,'Off budget',(select id from categories where name='Bebé'),'personal','2026-08-05');
set local role authenticated;
select is((get_monthly_budget('2026-08-01')->'categories'->0->>'spent')::bigint,25000::bigint,'refund and off-budget semantics');
select is((get_monthly_budget('2026-08-01')->>'actual_available')::bigint,65001::bigint,'actual available includes all exact spending buckets');
select is((get_monthly_budget('2026-08-01')->>'planned_available')::bigint,73456::bigint,'planned available');
select lives_ok($$select copy_budget('2026-08-01','2026-09-01')$$,'copy empty destination');
select throws_ok($$select copy_budget('2026-08-01','2026-09-01')$$,'23505',null,'overwrite protected');
select * from finish();
rollback;
