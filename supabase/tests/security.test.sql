-- Permission rules (spec §4). Relies on supabase/seed.sql:
-- ticket 1 → alexander (1111…), ticket 2 → claudia (2222…), admin (3333…) administrador, inactivo (4444…) inactive.
begin;
select plan(25);

-- ---------- anonymous ----------
set local role anon;
select is((select count(*)::int from public.tickets), 0, 'anonymous users see no tickets');
reset role;

-- ---------- claudia (other tailor) on alexander's ticket ----------
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.tickets where number = 1), 1, 'claudia can see alexander''s ticket');
select is((select count(*)::int from public.ticket_overview), 2, 'claudia sees all tickets in the overview');

select lives_ok(
  $$ update public.tickets set status = 'en_proceso', paid_in_full = true, deposit = 6000 where number = 1 $$,
  'claudia can change status and payment on alexander''s ticket');

select throws_ok(
  $$ update public.tickets set due_on = current_date + 10 where number = 1 $$,
  'P0001', 'Solo puedes cambiar estado y pago en arreglos de otra persona',
  'claudia cannot change dates on alexander''s ticket');

select throws_ok(
  $$ insert into public.ticket_items (ticket_id, garment, cost)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'Blusa', 5000) $$,
  '42501', null, 'claudia cannot add garments to alexander''s ticket');

delete from public.tickets where number = 1;
select is((select count(*)::int from public.tickets where number = 1), 1, 'claudia cannot delete tickets');

-- Ticket numbers come only from create_ticket (plan Review Focus 4), never from a direct insert.
select throws_ok(
  $$ insert into public.tickets (shop_id, number, customer_id, assigned_to, received_on, status)
     select shop_id, 999, customer_id, assigned_to, current_date, 'entregado' from public.tickets where number = 1 $$,
  '42501', null, 'claudia cannot insert tickets directly and pick the number or status');

-- ---------- alexander (assigned tailor) ----------
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ update public.tickets set due_on = current_date + 5, notes = 'Cliente pide prisa' where number = 1 $$,
  'alexander can fully edit his own ticket');
select lives_ok(
  $$ insert into public.ticket_items (ticket_id, garment, cost, position)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'Blusa', 5000, 2) $$,
  'alexander can add garments to his ticket');
select is((select updated_by from public.tickets where number = 1), '11111111-1111-1111-1111-111111111111'::uuid,
  'updated_by records the acting user');

-- The number is written on the paper receipt; not even the assigned tailor may change it.
select throws_ok(
  $$ update public.tickets set number = 777 where number = 1 $$,
  'P0001', 'El número del arreglo no se puede cambiar', 'alexander cannot renumber his own ticket');
select throws_ok(
  $$ update public.tickets set suffix = 'B' where number = 1 $$,
  'P0001', 'El número del arreglo no se puede cambiar', 'alexander cannot add a suffix to his own ticket');

select throws_ok(
  $$ update public.tickets set status = 'listo', location = null where number = 1 $$,
  'P0001', 'Elige la ubicación de la prenda', 'listo requires a storage location');

update public.tickets set status = 'entregado', location = 'A' where number = 1;
select is((select delivered_on from public.tickets where number = 1), public.today_bogota(),
  'entregado fills delivered_on with today');

-- ---------- inactive user ----------
reset role;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.tickets), 0, 'inactive user sees no tickets');
select is((select count(*)::int from public.customers), 0, 'inactive user sees no customers');
select throws_ok(
  $$ insert into public.customers (name) values ('Nuevo') $$,
  '42501', null, 'inactive user cannot create customers');

-- ---------- another shop: Sastrería Prueba Norte ----------
reset role;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.tickets), 1, 'a tailor of another shop sees only that shop''s ticket');
select is((select count(*)::int from public.customers where shop_id = '00000000-0000-0000-0000-00000000a001'), 0,
  'a tailor of another shop sees no customers of La Unión');
select throws_ok(
  $$ select public.create_ticket('cccccccc-0000-0000-0000-000000000001', null, null, null, null,
       '55555555-5555-5555-5555-555555555555', 0, false, null, '[{"garment":"X"}]') $$,
  'P0001', 'Cliente no encontrado', 'another shop cannot use a customer of La Unión');
select is((select number from public.create_ticket(null, 'Cliente Norte', null, null, null,
       '55555555-5555-5555-5555-555555555555', 0, false, null, '[{"garment":"Camisa"}]')), 2,
  'each shop has its own ticket numbers');

-- ---------- the platform (El Sastre) ----------
reset role;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.tickets), 0, 'the platform sees no tickets');
select is((select count(*)::int from public.shops), 2, 'the platform sees every shop');

-- ---------- admin ----------
reset role;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
delete from public.tickets where number = 2;
select is((select count(*)::int from public.tickets where number = 2), 0, 'admin can delete tickets');

reset role;
select * from finish();
rollback;
