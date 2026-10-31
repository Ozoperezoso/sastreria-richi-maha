-- Permission rules (spec §4). Relies on supabase/seed.sql:
-- ticket 1 → alexander (1111…), ticket 2 → claudia (2222…), rodrigo (3333…) admin, inactivo (4444…) inactive.
begin;
select plan(16);

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

-- ---------- rodrigo (admin) ----------
reset role;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
delete from public.tickets where number = 2;
select is((select count(*)::int from public.tickets where number = 2), 0, 'admin can delete tickets');

reset role;
select * from finish();
rollback;
