-- Platform admin: private shop contacts and usage counts. The platform user sees no tickets or
-- customers through RLS, so these functions return counts and user rows only.

-- ---------- Private contact details per shop ----------
create table public.shop_contacts (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.shop_contacts enable row level security;
-- Read-only for the platform; writes go through the admin-users function (service role).
create policy shop_contacts_select on public.shop_contacts for select to authenticated
  using (public.is_platform_admin());

-- ---------- Usage counts per shop ----------
create function public.platform_shop_stats() returns table (
  shop_id uuid, users_total int, users_active int, tailors_active int, tickets_total int,
  customers_total int, tickets_this_month int, months jsonb, last_activity_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select s.id,
    (select count(*)::int from public.profiles p where p.shop_id = s.id),
    (select count(*)::int from public.profiles p where p.shop_id = s.id and p.active),
    (select count(*)::int from public.profiles p where p.shop_id = s.id and p.active and p.role = 'tailor'),
    (select count(*)::int from public.tickets t where t.shop_id = s.id),
    (select count(*)::int from public.customers c where c.shop_id = s.id),
    (select count(*)::int from public.tickets t where t.shop_id = s.id
       and date_trunc('month', t.received_on) = date_trunc('month', public.today_bogota())),
    -- Six months, oldest first, ending with the current Bogotá month; empty months count 0.
    (select jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'tickets',
              (select count(*)::int from public.tickets t
                where t.shop_id = s.id and date_trunc('month', t.received_on) = m.month)) order by m.month)
       from generate_series(date_trunc('month', public.today_bogota()) - interval '5 months',
                            date_trunc('month', public.today_bogota()), interval '1 month') as m (month)),
    -- greatest() ignores nulls, so a shop with only one kind of activity still has a date.
    greatest((select max(t.updated_at) from public.tickets t where t.shop_id = s.id),
             (select max(u.last_sign_in_at) from public.profiles p
                join auth.users u on u.id = p.id where p.shop_id = s.id))
  from public.shops s;
end
$$;

-- ---------- Users of one shop, with last sign-in ----------
create function public.platform_shop_users(p_shop uuid) returns table (
  id uuid, username text, full_name text, role text, active boolean, created_at timestamptz,
  last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select p.id, p.username, p.full_name, p.role, p.active, p.created_at, u.last_sign_in_at
  from public.profiles p join auth.users u on u.id = p.id
  where p.shop_id = p_shop
  order by p.full_name;
end
$$;

revoke execute on function public.platform_shop_stats() from public, anon;
revoke execute on function public.platform_shop_users(uuid) from public, anon;
grant execute on function public.platform_shop_stats() to authenticated;
grant execute on function public.platform_shop_users(uuid) to authenticated;
