-- Database functions the app calls (plan Task 4).

-- Tickets can only be assigned to an active tailor. Service-role writes (importer) are exempt.
create function public.tickets_assignee_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (select 1 from public.profiles
                     where id = new.assigned_to and role = 'tailor' and active) then
    raise exception 'El arreglo debe asignarse a un sastre activo';
  end if;
  return new;
end;
$$;

create trigger tickets_assignee_check
before insert or update on public.tickets
for each row execute function public.tickets_assignee_check();

-- Creates customer (if needed), ticket and items in one transaction with the next shop number.
-- SECURITY DEFINER so the receiver can add items to a ticket assigned to the other tailor;
-- it therefore checks the caller itself. Audit and assignee triggers still see auth.uid().
create function public.create_ticket(
  p_customer_id uuid, p_customer_name text, p_customer_phone text,
  p_received_on date, p_due_on date, p_assigned_to uuid,
  p_deposit integer, p_warranty boolean, p_notes text, p_items jsonb
) returns public.ticket_overview
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
  v_ticket uuid;
  v_row public.ticket_overview;
begin
  if not public.is_active_user() then
    raise exception 'Usuario inactivo';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos una prenda';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where coalesce(trim(e ->> 'garment'), '') = '') then
    raise exception 'Cada prenda necesita un nombre';
  end if;

  if p_customer_id is not null then
    v_customer := p_customer_id;
  else
    if coalesce(trim(p_customer_name), '') = '' then
      raise exception 'Escribe el nombre del cliente';
    end if;
    insert into public.customers (name, phone)
    values (trim(p_customer_name), nullif(trim(p_customer_phone), ''))
    returning id into v_customer;
  end if;

  insert into public.tickets (number, customer_id, assigned_to, received_on, due_on, deposit, warranty, notes, status)
  values (nextval('public.ticket_number_seq'), v_customer, p_assigned_to,
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

-- Up to max_results (default 8) customers matching a name fragment (accent/case-insensitive) or phone digits.
create function public.search_customers(q text, max_results integer default 8) returns setof public.customers
language sql stable security invoker set search_path = '' as $$
  with input as (
    select lower(public.immutable_unaccent(trim(coalesce(q, '')))) as txt,
           regexp_replace(coalesce(q, ''), '\D', '', 'g') as raw_digits
  ), terms as (
    select txt,
           case when length(raw_digits) = 12 and raw_digits like '57%' then substr(raw_digits, 3)
                else raw_digits end as digits
    from input
  )
  select c.*
  from public.customers c, terms t
  where length(t.txt) >= 2
    and (strpos(c.search_text, t.txt) > 0
         or (length(t.digits) >= 3 and strpos(c.search_text, t.digits) > 0))
  order by extensions.similarity(c.search_text, t.txt) desc, c.name
  limit least(greatest(coalesce(max_results, 8), 1), 50)
$$;
revoke execute on function public.search_customers(text, integer) from public, anon;
grant execute on function public.search_customers(text, integer) to authenticated;

-- Admin dashboard figures per tailor for a date range (spec §5 Panel).
create function public.admin_totals(p_from date, p_to date)
returns table (tailor_id uuid, tailor_name text, money_received integer, delivered_count integer,
               warranty_count integer, open_count integer, overdue_count integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administrador';
  end if;
  return query
  select p.id, p.full_name,
         (coalesce(sum(o.deposit) filter (where o.received_on between p_from and p_to), 0)
          + coalesce(sum(o.total - o.deposit) filter (where o.status = 'entregado' and o.paid_in_full
                                                     and o.delivered_on between p_from and p_to), 0))::integer,
         (count(o.id) filter (where o.status = 'entregado' and o.delivered_on between p_from and p_to))::integer,
         (count(o.id) filter (where o.warranty and o.received_on between p_from and p_to))::integer,
         (count(o.id) filter (where o.status not in ('entregado', 'cancelado')))::integer,
         (count(o.id) filter (where o.overdue))::integer
  from public.profiles p
  left join public.ticket_overview o on o.assigned_to = p.id
  where p.role = 'tailor'
  group by p.id, p.full_name
  order by p.full_name;
end;
$$;
revoke execute on function public.admin_totals(date, date) from public, anon;
grant execute on function public.admin_totals(date, date) to authenticated;
