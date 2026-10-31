-- Used by the importer (service role only): move the shop number sequence past imported numbers.
create function public.sync_ticket_number_seq() returns bigint
language sql security definer set search_path = '' as $$
  select setval('public.ticket_number_seq',
                greatest((select coalesce(max(number), 1) from public.tickets),
                         (select last_value from public.ticket_number_seq)))
$$;
revoke execute on function public.sync_ticket_number_seq() from public, anon, authenticated;
grant execute on function public.sync_ticket_number_seq() to service_role;
