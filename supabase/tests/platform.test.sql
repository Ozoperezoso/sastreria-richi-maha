-- Platform-only reads (spec 3.1-3.3). Relies on supabase/seed.sql:
-- La Unión (…a001) has 4 users (3 active, 2 active tailors), 2 tickets, 2 customers; plataforma is 6666….
begin;
select plan(25);

-- A contact row and an empty shop, created as the table owner.
insert into public.shop_contacts (shop_id, contact_name) values ('00000000-0000-0000-0000-00000000a001', 'Dueña');
update auth.users set last_sign_in_at = now() where id = '11111111-1111-1111-1111-111111111111';
insert into public.shops (id, slug, name) values ('00000000-0000-0000-0000-00000000c003', 'sin-uso', 'Sastrería Sin Uso');

-- ---------- anon ----------
set local role anon;
select throws_ok($$ select * from public.platform_shop_stats() $$, '42501', null, 'anon cannot call platform stats');
reset role;

-- ---------- admin of La Unión ----------
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from public.platform_shop_stats() $$, 'P0001', 'Solo la plataforma', 'a shop admin cannot read platform stats');
select is((select count(*)::int from public.shop_contacts), 0, 'shop users see no shop_contacts');

-- ---------- alexander (tailor) ----------
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok($$ select * from public.platform_shop_users('00000000-0000-0000-0000-00000000a001') $$,
  'P0001', 'Solo la plataforma', 'a tailor cannot list shop users');

-- ---------- tickets at the month boundary, created as postgres ----------
reset role;
create temp table baseline (n int);
grant all on baseline to authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local role authenticated;
insert into baseline select tickets_this_month from public.platform_shop_stats()
  where shop_id = '00000000-0000-0000-0000-00000000a001';
reset role;
insert into public.tickets (shop_id, number, customer_id, assigned_to, received_on, status)
values ('00000000-0000-0000-0000-00000000a001', 101, 'cccccccc-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', date_trunc('month', public.today_bogota())::date, 'recibido');

-- ---------- plataforma ----------
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local role authenticated;

select is((select tickets_this_month from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  (select n + 1 from baseline), 'a ticket on the first day of the Bogotá month counts this month');

reset role;
insert into public.tickets (shop_id, number, customer_id, assigned_to, received_on, status)
values ('00000000-0000-0000-0000-00000000a001', 102, 'cccccccc-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', (date_trunc('month', public.today_bogota()) - interval '1 day')::date, 'recibido');
set local role authenticated;

select is((select tickets_this_month from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  (select n + 1 from baseline), 'a ticket on the last day of the previous month does not');

-- Expected previous-month count computed as postgres: seed ticket 1 (today - 3) may fall in either month.
reset role;
create temp table expected_prev as
  select count(*)::int as n from public.tickets where shop_id = '00000000-0000-0000-0000-00000000a001'
    and date_trunc('month', received_on) = date_trunc('month', public.today_bogota()) - interval '1 month';
grant select on expected_prev to authenticated;
set local role authenticated;
select is((select (months -> 4 ->> 'tickets')::int from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  (select n from expected_prev), 'the previous-month ticket shows in the previous bar');

-- Counts below ignore the two tickets added above (ticket total is 4 now).
select is((select array[users_total, users_active, tailors_active, tickets_total, customers_total]
           from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  array[4, 3, 2, 4, 2], 'La Unión counts');
-- Expected value computed as postgres, since the platform cannot read tickets itself.
reset role;
create temp table expected_month as
  select count(*)::int as n from public.tickets where shop_id = '00000000-0000-0000-0000-00000000a001'
    and date_trunc('month', received_on) = date_trunc('month', public.today_bogota());
grant select on expected_month to authenticated;
set local role authenticated;
select is((select tickets_this_month from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  (select n from expected_month),
  'tickets_this_month counts received_on in the current Bogotá month');
select is((select jsonb_array_length(months) from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'), 6, 'six months');
select is((select months -> 5 ->> 'month' from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  to_char(public.today_bogota(), 'YYYY-MM'), 'last month is the current one');
select is((select (months -> 5 ->> 'tickets')::int from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'),
  (select tickets_this_month from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'), 'last bar equals this month');
select is((select (months -> 0 ->> 'tickets')::int from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000a001'), 0, 'empty months are 0');
select is((select count(*)::int from public.platform_shop_users('00000000-0000-0000-0000-00000000a001')), 4, 'all La Unión users, active or not');
select is((select username from public.platform_shop_users('00000000-0000-0000-0000-00000000a001') where last_sign_in_at is not null),
  'alexander', 'users carry last_sign_in_at from auth.users');
select is((select count(*)::int from public.shop_contacts), 1, 'the platform reads shop_contacts');

-- A shop with no users and no tickets still has a row, with zero counts and no activity.
select is((select row(users_total, tickets_total, customers_total, tickets_this_month, last_activity_at is null)::text
           from public.platform_shop_stats() where shop_id = '00000000-0000-0000-0000-00000000c003'),
  '(0,0,0,0,t)', 'an empty shop has zero counts and null last_activity_at');

-- ---------- no customer or money data in the signatures ----------
reset role;
select is((select (pg_get_function_result('public.platform_shop_stats()'::regprocedure) || ' ' ||
                   pg_get_function_result('public.platform_shop_users(uuid)'::regprocedure))
                  ~ '(customer_name|customer_phone|phone|garment|fix|notes|items|balance|deposit|cost)'),
  false, 'the functions expose no customer, ticket text or money columns');

-- ---------- delete_shop_data (spec 3.4) ----------
-- Still the platform user at this point; it has no execute grant.
set local role authenticated;
select throws_ok($$ select public.delete_shop_data('00000000-0000-0000-0000-00000000b002') $$,
  '42501', null, 'authenticated cannot run delete_shop_data');

-- Service role equivalent: the table owner.
reset role;
create temp table la_union_before as
  select count(*)::int as n from public.tickets where shop_id = '00000000-0000-0000-0000-00000000a001';
select throws_ok($$ select public.delete_shop_data('00000000-0000-0000-0000-00000000b002') $$,
  'P0001', 'Primero desactiva la sastrería', 'refuses an active shop');

update public.shops set active = false where id = '00000000-0000-0000-0000-00000000b002';
select is((select count(*)::int from public.delete_shop_data('00000000-0000-0000-0000-00000000b002')), 1,
  'the first run returns the shop profile');
select is((select count(*)::int from public.tickets where shop_id = '00000000-0000-0000-0000-00000000b002'), 0, 'its tickets are gone');
select is((select count(*)::int from public.customers where shop_id = '00000000-0000-0000-0000-00000000b002'), 0, 'its customers are gone');
select is((select count(*)::int from public.tickets where shop_id = '00000000-0000-0000-0000-00000000a001'),
  (select n from la_union_before), 'La Unión keeps its tickets');
select is((select count(*)::int from public.delete_shop_data('00000000-0000-0000-0000-00000000b002')), 1,
  'running again is safe and returns the remaining profile');

select * from finish();
rollback;
