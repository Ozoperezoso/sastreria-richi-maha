-- create_ticket, search_customers, admin_totals (plan Task 4). Relies on supabase/seed.sql.
begin;
select plan(18);

-- ---------- admin_totals (run first: later tests add tickets) ----------
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from public.admin_totals(current_date - 7, current_date) $$,
  'P0001', 'Solo administrador', 'tailors cannot read admin totals');

reset role;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
-- seed ticket 1 (alexander): items 24000, deposit 5000, received 3 days ago → deliver it today, fully paid
update public.tickets set status = 'entregado', paid_in_full = true where number = 1;
select is(
  (select money_received from public.admin_totals(public.today_bogota() - 7, public.today_bogota())
   where tailor_name = 'Alexander Rengifo'),
  24000, 'money received = deposit on received date + remaining balance on delivery date');
select is(
  (select delivered_count from public.admin_totals(public.today_bogota() - 7, public.today_bogota())
   where tailor_name = 'Alexander Rengifo'),
  1, 'delivered tickets are counted per tailor');
select is(
  (select open_count from public.admin_totals(public.today_bogota() - 7, public.today_bogota())
   where tailor_name = 'Claudia Alvarez'),
  1, 'open tickets are counted per tailor');

select is(
  (select count(*)::int from public.admin_totals(public.today_bogota() - 7, public.today_bogota())
   where tailor_name = 'Usuario Inactivo'),
  0, 'inactive tailors without tickets are not listed');

-- ---------- create_ticket as claudia, assigning to alexander ----------
reset role;
-- sequences are not rolled back between runs, so read the expected next number first
create temporary table expected on commit drop as select last_value + 1 as next_number from public.ticket_number_seq;
grant select on expected to authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

create temporary table created on commit drop as
select * from public.create_ticket(
  null, 'José Muñoz', '311 555 0000', public.today_bogota(), null,
  '11111111-1111-1111-1111-111111111111', 5000, false, null,
  '[{"garment":"Jean","fix":"Ruedo","cost":10000},{"garment":"Blusa","fix":"Costados","cost":14000}]');

select is((select number from created), (select next_number::int from expected), 'number is the next value of the shop sequence');
select is((select array[total, balance] from created), array[24000, 19000], 'returned row has total and balance');
select is((select assigned_name from created), 'Alexander Rengifo', 'receiver can assign the ticket to the other tailor');
select is((select created_by from created), '22222222-2222-2222-2222-222222222222'::uuid, 'created_by is the receiver');
select is((select count(*)::int from public.customers where name = 'José Muñoz' and phone = '311 555 0000'), 1,
  'a new customer is created when no customer id is given');

select is(
  (select customer_id from public.create_ticket(
     'cccccccc-0000-0000-0000-000000000002', null, null, public.today_bogota(), null,
     '22222222-2222-2222-2222-222222222222', 0, false, null, '[{"garment":"Falda","fix":"Ruedo","cost":8000}]')),
  'cccccccc-0000-0000-0000-000000000002'::uuid, 'an existing customer is reused');

select throws_ok(
  $$ select * from public.create_ticket(null, 'Cliente', null, current_date, null,
       '22222222-2222-2222-2222-222222222222', 0, false, null, '[]') $$,
  'P0001', 'Agrega al menos una prenda', 'a ticket needs at least one garment');

select throws_ok(
  $$ select * from public.create_ticket(null, 'Cliente', null, current_date, null,
       '33333333-3333-3333-3333-333333333333', 0, false, null, '[{"garment":"Jean","cost":1}]') $$,
  'P0001', 'El arreglo debe asignarse a un sastre activo', 'tickets cannot be assigned to the admin');

select throws_ok(
  $$ update public.tickets set assigned_to = '44444444-4444-4444-4444-444444444444' where number = 2 $$,
  'P0001', 'El arreglo debe asignarse a un sastre activo', 'tickets cannot be reassigned to an inactive user');

-- ---------- search_customers ----------
select is((select name from public.search_customers('munoz') where phone = '3112345678'), 'MARÍA MUÑOZ',
  'search ignores accents and case');
select is((select name from public.search_customers('311 234')), 'MARÍA MUÑOZ',
  'phone search ignores spaces');

insert into public.customers (name) select 'ZZLIMITE ' || g from generate_series(1, 12) g;
select is((select count(*)::int from public.search_customers('zzlimite')), 8, 'search returns 8 customers by default');
select is((select count(*)::int from public.search_customers('zzlimite', 30)), 12, 'max_results raises the limit');

reset role;
select * from finish();
rollback;
