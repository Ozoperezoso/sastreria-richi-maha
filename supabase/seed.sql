-- LOCAL DEVELOPMENT ONLY. Never run against production.
-- Users (password for all: test1234): alexander, claudia (tailors), rodrigo (admin), inactivo (inactive tailor).

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('test1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'alexander@sastreria.local'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'claudia@sastreria.local'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'rodrigo@sastreria.local'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'inactivo@sastreria.local')
) as u (id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u where u.email like '%@sastreria.local';

insert into public.profiles (id, username, full_name, role, active) values
  ('11111111-1111-1111-1111-111111111111', 'alexander', 'Alexander Rengifo', 'tailor', true),
  ('22222222-2222-2222-2222-222222222222', 'claudia', 'Claudia Alvarez', 'tailor', true),
  ('33333333-3333-3333-3333-333333333333', 'rodrigo', 'Rodrigo', 'admin', true),
  ('44444444-4444-4444-4444-444444444444', 'inactivo', 'Usuario Inactivo', 'tailor', false);

insert into public.customers (id, name, phone) values
  ('cccccccc-0000-0000-0000-000000000001', 'MARÍA MUÑOZ', '3112345678'),
  ('cccccccc-0000-0000-0000-000000000002', 'LAURA CIRO', '3001112233');

insert into public.tickets (id, number, customer_id, assigned_to, received_on, due_on, status, deposit, created_by, updated_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 1, 'cccccccc-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', public.today_bogota() - 3, public.today_bogota() - 1, 'en_proceso', 5000,
   '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 2, 'cccccccc-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', public.today_bogota(), public.today_bogota() + 2, 'recibido', 0,
   '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

insert into public.ticket_items (ticket_id, garment, fix, cost, position) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Jean', 'Ruedo original', 14000, 0),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Chaqueta', 'Cambio de cierre', 10000, 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Sudadera', 'Entubar', 12000, 0);

select setval('public.ticket_number_seq', 2);
