-- El Sastre as a platform for several shops. Sastrería La Unión is the first shop.
-- Every user, customer and ticket belongs to one shop; the database only shows a user the rows of their own shop.
-- Roles: 'platform' (El Sastre itself: creates shops, sees no tickets or customers),
--        'admin' (a shop's administrator) and 'tailor'.

-- ---------- Shops ----------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,30}$'),
  name text not null check (length(trim(name)) > 0),
  city text,
  active boolean not null default true,
  -- Each shop numbers its own tickets; create_ticket takes and bumps this under a row lock.
  next_ticket_number integer not null default 1 check (next_ticket_number > 0),
  created_at timestamptz not null default now()
);

insert into public.shops (id, slug, name, next_ticket_number)
values ('00000000-0000-0000-0000-00000000a001', 'la-union', 'Sastrería La Unión',
        greatest(coalesce((select max(number) from public.tickets), 0),
                 (select case when is_called then last_value else last_value - 1 end from public.ticket_number_seq)) + 1);

-- ---------- Shop on every row (existing rows go to La Unión) ----------
alter table public.profiles add column shop_id uuid references public.shops (id);
update public.profiles set shop_id = '00000000-0000-0000-0000-00000000a001';
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('platform', 'admin', 'tailor'));
alter table public.profiles add constraint profiles_shop_check check ((role = 'platform') = (shop_id is null));
create index profiles_shop_idx on public.profiles (shop_id);

alter table public.customers add column shop_id uuid references public.shops (id);
update public.customers set shop_id = '00000000-0000-0000-0000-00000000a001';
alter table public.customers alter column shop_id set not null;
create index customers_shop_idx on public.customers (shop_id);

alter table public.tickets add column shop_id uuid references public.shops (id);
update public.tickets set shop_id = '00000000-0000-0000-0000-00000000a001';
alter table public.tickets alter column shop_id set not null;
alter table public.tickets drop constraint tickets_number_suffix_key;
alter table public.tickets add constraint tickets_shop_number_suffix_key unique (shop_id, number, suffix);
drop index public.tickets_assigned_status_idx;
create index tickets_shop_status_idx on public.tickets (shop_id, status);
create index tickets_assigned_status_idx on public.tickets (assigned_to, status);

-- The ticket view picks up shop_id through t.*; recreate it so the new column is included.
-- create_ticket returns this view's row type, so it goes too and is recreated below.
drop view public.ticket_overview cascade;
create view public.ticket_overview with (security_invoker = true) as
select
  t.*,
  case when t.suffix = '' then t.number::text else t.number::text || '-' || t.suffix end as display_number,
  c.name as customer_name,
  c.phone as customer_phone,
  p.full_name as assigned_name,
  coalesce(i.items_summary, '') as items_summary,
  coalesce(i.fixes_summary, '') as fixes_summary,
  case when t.warranty then 0 else coalesce(i.items_total, 0) end::integer as total,
  case when t.warranty or t.paid_in_full then 0
       else coalesce(i.items_total, 0) - t.deposit end::integer as balance,
  (t.due_on < public.today_bogota() and t.status not in ('entregado', 'cancelado')) as overdue
from public.tickets t
join public.customers c on c.id = t.customer_id
join public.profiles p on p.id = t.assigned_to
left join lateral (
  select string_agg(it.garment, ', ' order by it.position) as items_summary,
         string_agg(nullif(it.fix, ''), ', ' order by it.position) as fixes_summary,
         sum(it.cost) as items_total
  from public.ticket_items it
  where it.ticket_id = t.id
) i on true;

-- ---------- Who is calling ----------
-- A user counts as active only while their shop is active too (the platform has no shop).
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p left join public.shops s on s.id = p.shop_id
                 where p.id = auth.uid() and p.active and (p.role = 'platform' or s.active))
$$;

-- Administrator of the caller's own shop.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.shops s on s.id = p.shop_id
                 where p.id = auth.uid() and p.active and p.role = 'admin' and s.active)
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'platform')
$$;

-- The caller's shop, or null for the platform, inactive users and inactive shops.
create function public.current_shop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.shop_id from public.profiles p join public.shops s on s.id = p.shop_id
  where p.id = auth.uid() and p.active and s.active
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.current_shop_id() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.current_shop_id() to authenticated;

-- ---------- Row-level security: one shop at a time ----------
alter table public.shops enable row level security;
-- Shops are created and changed only through the admin-users function (service role).
create policy shops_select on public.shops for select to authenticated
  using (public.is_platform_admin() or id = public.current_shop_id());

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_platform_admin() or shop_id = public.current_shop_id());

drop policy customers_select on public.customers;
drop policy customers_insert on public.customers;
drop policy customers_update on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (shop_id = public.current_shop_id());
create policy customers_insert on public.customers for insert to authenticated
  with check (shop_id = public.current_shop_id());
create policy customers_update on public.customers for update to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());
alter table public.customers alter column shop_id set default public.current_shop_id();

drop policy tickets_select on public.tickets;
drop policy tickets_update on public.tickets;
drop policy tickets_delete on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (shop_id = public.current_shop_id());
create policy tickets_update on public.tickets for update to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.is_admin() and shop_id = public.current_shop_id());

-- Items: visible when their ticket is (tickets RLS applies inside the check); editable by the shop's admin
-- or the ticket's assigned tailor.
create or replace function public.can_edit_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tickets t
                 where t.id = p_ticket_id and t.shop_id = public.current_shop_id()
                   and (public.is_admin() or t.assigned_to = auth.uid()))
$$;
drop policy items_select on public.ticket_items;
create policy items_select on public.ticket_items for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));

-- ---------- Rows never move between shops ----------
create or replace function public.tickets_column_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  free_columns text[] := array['status', 'location', 'deposit', 'paid_in_full', 'picked_up_by',
                               'delivered_on', 'updated_by', 'updated_at'];
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.shop_id is distinct from old.shop_id then
    raise exception 'Un arreglo no puede pasar a otra sastrería';
  end if;
  if public.is_admin() then
    return new;
  end if;
  if (new.number, new.suffix, new.legacy) is distinct from (old.number, old.suffix, old.legacy) then
    raise exception 'El número del arreglo no se puede cambiar';
  end if;
  if old.assigned_to = auth.uid() then
    return new;
  end if;
  if (to_jsonb(new) - free_columns) is distinct from (to_jsonb(old) - free_columns) then
    raise exception 'Solo puedes cambiar estado y pago en arreglos de otra persona';
  end if;
  return new;
end;
$$;

create function public.customers_shop_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.shop_id is distinct from old.shop_id then
    raise exception 'Un cliente no puede pasar a otra sastrería';
  end if;
  return new;
end;
$$;
create trigger customers_shop_guard
before update on public.customers
for each row execute function public.customers_shop_guard();

-- A ticket can only be assigned to an active tailor of its own shop. The ticket's customer must be of that shop too.
create or replace function public.tickets_assignee_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (select 1 from public.profiles
                     where id = new.assigned_to and role = 'tailor' and active and shop_id = new.shop_id) then
    raise exception 'El arreglo debe asignarse a un sastre activo';
  end if;
  if (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id)
     and not exists (select 1 from public.customers where id = new.customer_id and shop_id = new.shop_id) then
    raise exception 'El cliente no es de esta sastrería';
  end if;
  return new;
end;
$$;

-- ---------- create_ticket: the caller's shop and that shop's next number ----------
create function public.create_ticket(
  p_customer_id uuid, p_customer_name text, p_customer_phone text,
  p_received_on date, p_due_on date, p_assigned_to uuid,
  p_deposit integer, p_warranty boolean, p_notes text, p_items jsonb
) returns public.ticket_overview
language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid := public.current_shop_id();
  v_customer uuid;
  v_number integer;
  v_ticket uuid;
  v_row public.ticket_overview;
begin
  if v_shop is null then
    raise exception 'Usuario inactivo';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos una prenda';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where coalesce(trim(e ->> 'garment'), '') = '') then
    raise exception 'Cada prenda necesita un nombre';
  end if;

  if p_customer_id is not null then
    -- SECURITY DEFINER skips RLS, so check the customer's shop here.
    select id into v_customer from public.customers where id = p_customer_id and shop_id = v_shop;
    if v_customer is null then
      raise exception 'Cliente no encontrado';
    end if;
  else
    if coalesce(trim(p_customer_name), '') = '' then
      raise exception 'Escribe el nombre del cliente';
    end if;
    insert into public.customers (name, phone, shop_id)
    values (trim(p_customer_name), nullif(trim(p_customer_phone), ''), v_shop)
    returning id into v_customer;
  end if;

  update public.shops set next_ticket_number = next_ticket_number + 1
  where id = v_shop returning next_ticket_number - 1 into v_number;

  insert into public.tickets (shop_id, number, customer_id, assigned_to, received_on, due_on, deposit, warranty, notes, status)
  values (v_shop, v_number, v_customer, p_assigned_to,
          coalesce(p_received_on, public.today_bogota()), p_due_on, coalesce(p_deposit, 0),
          coalesce(p_warranty, false), nullif(trim(p_notes), ''), 'recibido')
  returning id into v_ticket;

  insert into public.ticket_items (ticket_id, garment, fix, notes, cost, position)
  select v_ticket, trim(x.e ->> 'garment'), coalesce(trim(x.e ->> 'fix'), ''),
         nullif(trim(x.e ->> 'notes'), ''), coalesce((x.e ->> 'cost')::integer, 0), (x.ord - 1)::integer
  from jsonb_array_elements(p_items) with ordinality as x (e, ord);

  select * into v_row from public.ticket_overview where id = v_ticket;
  return v_row;
end;
$$;
revoke execute on function public.create_ticket(uuid, text, text, date, date, uuid, integer, boolean, text, jsonb) from public, anon;
grant execute on function public.create_ticket(uuid, text, text, date, date, uuid, integer, boolean, text, jsonb) to authenticated;
grant select on public.ticket_overview to authenticated;
revoke all on public.ticket_overview from anon;

-- ---------- Importer (service role only): move a shop's counter past its imported numbers ----------
drop function public.sync_ticket_number_seq();
create function public.sync_shop_ticket_number(p_shop uuid) returns integer
language sql security definer set search_path = '' as $$
  update public.shops
  set next_ticket_number = greatest(next_ticket_number,
                                    coalesce((select max(number) from public.tickets where shop_id = p_shop), 0) + 1)
  where id = p_shop
  returning next_ticket_number
$$;
revoke execute on function public.sync_shop_ticket_number(uuid) from public, anon, authenticated;
grant execute on function public.sync_shop_ticket_number(uuid) to service_role;

drop sequence public.ticket_number_seq;
