-- Sastrería Richi-Maha: core schema (spec §3)

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.ticket_status as enum ('recibido', 'en_proceso', 'listo', 'entregado', 'cancelado');
create type public.storage_location as enum ('A', 'B', 'C', 'D', 'E', 'CAJON', 'BODEGA');

-- "Today" for the shop is Colombian time, not the server's UTC date.
create function public.today_bogota() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- unaccent() is only STABLE; generated columns and indexes need an IMMUTABLE wrapper.
create function public.immutable_unaccent(value text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

create function public.search_key(name text, phone text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(public.immutable_unaccent(coalesce(name, ''))) || ' '
         || regexp_replace(coalesce(phone, ''), '\D', '', 'g')
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  full_name text not null check (length(trim(full_name)) > 0),
  role text not null check (role in ('admin', 'tailor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  created_at timestamptz not null default now(),
  search_text text generated always as (public.search_key(name, phone)) stored
);
create index customers_search_trgm on public.customers using gin (search_text extensions.gin_trgm_ops);

create sequence public.ticket_number_seq;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  number integer not null check (number > 0),
  suffix text not null default '',
  customer_id uuid not null references public.customers (id),
  assigned_to uuid not null references public.profiles (id),
  received_on date not null,
  due_on date,
  delivered_on date,
  status public.ticket_status not null default 'recibido',
  location public.storage_location,
  picked_up_by text,
  deposit integer not null default 0 check (deposit >= 0),
  paid_in_full boolean not null default false,
  warranty boolean not null default false,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  legacy jsonb,
  unique (number, suffix)
);
create index tickets_customer_idx on public.tickets (customer_id);
create index tickets_assigned_status_idx on public.tickets (assigned_to, status);
create index tickets_due_idx on public.tickets (due_on);

create table public.ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  garment text not null check (length(trim(garment)) > 0),
  fix text not null default '',
  notes text,
  cost integer not null default 0 check (cost >= 0),
  position integer not null default 0
);
create index ticket_items_ticket_idx on public.ticket_items (ticket_id);

-- One row per ticket with everything the screens need. security_invoker keeps RLS of the caller.
create view public.ticket_overview with (security_invoker = true) as
select
  t.*,
  case when t.suffix = '' then t.number::text else t.number::text || '-' || t.suffix end as display_number,
  c.name as customer_name,
  c.phone as customer_phone,
  p.full_name as assigned_name,
  coalesce(i.items_summary, '') as items_summary,
  case when t.warranty then 0 else coalesce(i.items_total, 0) end::integer as total,
  case when t.warranty or t.paid_in_full then 0
       else coalesce(i.items_total, 0) - t.deposit end::integer as balance,
  (t.due_on < public.today_bogota() and t.status not in ('entregado', 'cancelado')) as overdue
from public.tickets t
join public.customers c on c.id = t.customer_id
join public.profiles p on p.id = t.assigned_to
left join lateral (
  select string_agg(it.garment, ', ' order by it.position) as items_summary,
         sum(it.cost) as items_total
  from public.ticket_items it
  where it.ticket_id = t.id
) i on true;
