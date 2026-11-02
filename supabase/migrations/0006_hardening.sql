-- Security review fixes (2026-11-02).

-- 1. Tickets are created only through create_ticket, which takes the number from the shop sequence
--    (plan Review Focus 4). A direct insert let any active user pick the number, status or payment.
--    create_ticket is SECURITY DEFINER, and the importer and tests use the service role, so neither needs this policy.
drop policy tickets_insert on public.tickets;

-- 2. The ticket number is written on the paper receipt. Only the admin may change number, suffix
--    or the imported sheet row; tailors keep every other rule they had.
create or replace function public.tickets_column_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  free_columns text[] := array['status', 'location', 'deposit', 'paid_in_full', 'picked_up_by',
                               'delivered_on', 'updated_by', 'updated_at'];
begin
  if auth.uid() is null or public.is_admin() then
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
