-- Audit columns and status workflow rules (spec §3 "Status rules").

create function public.tickets_audit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create trigger tickets_audit
before insert or update on public.tickets
for each row execute function public.tickets_audit();

create function public.tickets_status_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'listo' and new.location is null then
    raise exception 'Elige la ubicación de la prenda';
  end if;
  if new.status = 'entregado' and new.delivered_on is null then
    new.delivered_on := public.today_bogota();
  end if;
  return new;
end;
$$;

create trigger tickets_status_rules
before insert or update on public.tickets
for each row execute function public.tickets_status_rules();
