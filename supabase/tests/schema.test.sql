begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'customers', 'customers table exists');
select has_table('public', 'tickets', 'tickets table exists');
select has_table('public', 'ticket_items', 'ticket_items table exists');
select col_not_null('public', 'customers', 'name', 'customer name is required');

-- fixtures
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'schema_t@sastreria.local');
insert into public.profiles (id, username, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'schema_t', 'Schema Tailor', 'tailor');
insert into public.customers (id, name, phone) values
  ('00000000-0000-0000-0000-0000000000c1', 'Cliente Prueba', '3001234567');

insert into public.tickets (id, number, customer_id, assigned_to, received_on, due_on, status, deposit)
values ('00000000-0000-0000-0000-0000000000b1', 90001, '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000a1', current_date, public.today_bogota() - 1, 'en_proceso', 5000);
insert into public.ticket_items (ticket_id, garment, fix, cost, position) values
  ('00000000-0000-0000-0000-0000000000b1', 'Jean', 'Ruedo', 10000, 0),
  ('00000000-0000-0000-0000-0000000000b1', 'Blusa', 'Costados', 14000, 1);

select throws_ok(
  $$ insert into public.tickets (number, customer_id, assigned_to, received_on, status)
     values (90001, '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', current_date, 'recibido') $$,
  '23505', null, 'duplicate (number, suffix) is rejected');

select is(
  (select array[total, balance] from public.ticket_overview where number = 90001),
  array[24000, 19000], 'total is sum of items and balance is total minus deposit');

select is((select overdue from public.ticket_overview where number = 90001), true,
  'en_proceso ticket past its due date is overdue');

select is((select items_summary from public.ticket_overview where number = 90001), 'Jean, Blusa',
  'items_summary joins garments in position order');

update public.tickets set paid_in_full = true where number = 90001;
select is((select balance from public.ticket_overview where number = 90001), 0, 'paid_in_full zeroes balance');

update public.tickets set paid_in_full = false, warranty = true where number = 90001;
select is((select array[total, balance] from public.ticket_overview where number = 90001), array[0, 0],
  'warranty zeroes total and balance');

update public.tickets set warranty = false, status = 'entregado', delivered_on = current_date where number = 90001;
select is((select overdue from public.ticket_overview where number = 90001), false, 'delivered ticket is never overdue');

select * from finish();
rollback;
