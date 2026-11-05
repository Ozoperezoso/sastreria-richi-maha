-- Row-level security and the per-column guard (spec §4).
-- Writes made with the service role (importer, admin-users function) bypass RLS; auth.uid() is null there.

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin')
$$;

revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;

-- profiles: readable by active users (names for "assigned to"); written only via the admin-users function.
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user());

-- customers: any active user can read, create and correct customers.
create policy customers_select on public.customers for select to authenticated
  using (public.is_active_user());
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_active_user());
create policy customers_update on public.customers for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- tickets
create policy tickets_select on public.tickets for select to authenticated
  using (public.is_active_user());
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.is_active_user());
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.is_admin());

-- ticket_items: readable by all active users; writable by the admin or the ticket's assigned tailor.
create function public.can_edit_ticket(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or exists (select 1 from public.tickets t
                 where t.id = p_ticket_id and t.assigned_to = auth.uid() and public.is_active_user())
$$;
revoke execute on function public.can_edit_ticket(uuid) from public, anon;
grant execute on function public.can_edit_ticket(uuid) to authenticated;

create policy items_select on public.ticket_items for select to authenticated
  using (public.is_active_user());
create policy items_insert on public.ticket_items for insert to authenticated
  with check (public.can_edit_ticket(ticket_id));
create policy items_update on public.ticket_items for update to authenticated
  using (public.can_edit_ticket(ticket_id)) with check (public.can_edit_ticket(ticket_id));
create policy items_delete on public.ticket_items for delete to authenticated
  using (public.can_edit_ticket(ticket_id));

-- A tailor who is not assigned to a ticket may change only status and payment fields.
create function public.tickets_column_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  free_columns text[] := array['status', 'location', 'deposit', 'paid_in_full', 'picked_up_by',
                               'delivered_on', 'updated_by', 'updated_at'];
begin
  if auth.uid() is null or public.is_admin() or old.assigned_to = auth.uid() then
    return new;
  end if;
  if (to_jsonb(new) - free_columns) is distinct from (to_jsonb(old) - free_columns) then
    raise exception 'Solo puedes cambiar estado y pago en arreglos de otra persona';
  end if;
  return new;
end;
$$;

create trigger tickets_column_guard
before update on public.tickets
for each row execute function public.tickets_column_guard();
