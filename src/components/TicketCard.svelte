<script>
  // One ticket as a row on the tape measure: the yellow strip counts days until the promised date
  // (negative when late) or, with mode="waiting", days the garment has waited on the shelf.
  import { formatCOP, formatDate, todayISO, locationLabel, statusLabel, daysBetween, tapeMark, readySince } from '../lib/format.js';

  let { ticket, showTailor = true, mode = 'due' } = $props();

  const today = todayISO();
  const open = $derived(!['entregado', 'cancelado'].includes(ticket.status));
  const waiting = $derived(mode === 'waiting' && ticket.status === 'listo');
  const days = $derived(
    waiting ? daysBetween(readySince(ticket), today)
      : ticket.due_on ? daysBetween(today, ticket.due_on) : null,
  );
  const mark = $derived(
    !open ? { mark: '✓', unit: '' }
      : waiting ? tapeMark(days, { future: 'count' })
      : tapeMark(days, { iso: ticket.due_on }),
  );
  const late = $derived(open && !waiting && Boolean(ticket.overdue));
  const state = $derived(
    !open ? `${statusLabel(ticket.status)} ${formatDate(ticket.delivered_on)}`.trim()
      : ticket.status === 'listo' ? `Listo en ${locationLabel(ticket.location) || 'el estante'}`
      : late ? `Atrasado, ${ticket.status === 'recibido' ? 'sin empezar' : 'en proceso'}`
      : ticket.status === 'recibido' ? 'Sin empezar' : statusLabel(ticket.status),
  );
  const markLabel = $derived(
    !open ? '' : days === null ? 'Sin fecha de entrega'
      : waiting ? `${days} ${days === 1 ? 'día' : 'días'} esperando`
      : days === 0 ? 'Se entrega hoy'
      : days < 0 ? `Atrasado ${-days} ${days === -1 ? 'día' : 'días'}`
      : `Se entrega en ${days} ${days === 1 ? 'día' : 'días'}, ${formatDate(ticket.due_on)}`,
  );
</script>

<a class="tag" class:late class:closed={!open} href="#/arreglo/{ticket.id}">
  <span class="tape" class:late aria-hidden="true">
    <span class="mark narrow">{mark.mark}</span>
    {#if mark.unit}<span class="unit">{mark.unit}</span>{/if}
  </span>
  <span class="body">
    <span class="row">
      <strong class="customer">{ticket.customer_name}</strong>
      <span class="number narrow num" aria-label="Arreglo número {ticket.display_number}">{ticket.display_number}</span>
    </span>
    <span class="items">{ticket.items_summary}</span>
    <span class="row meta">
      <span class="state" class:late>{state}{#if markLabel}<span class="sr">. {markLabel}</span>{/if}</span>
      {#if ticket.balance > 0}<span class="balance num">Debe {formatCOP(ticket.balance)}</span>
      {:else if open && ticket.total > 0}<span class="paid">Pagado</span>{/if}
    </span>
    {#if showTailor}<span class="meta muted">{ticket.assigned_name}</span>{/if}
  </span>
  {#if ticket.status === 'listo' && ticket.location}
    <span class="loc narrow" aria-hidden="true">{locationLabel(ticket.location)}</span>
  {/if}
</a>

<style>
  .tag {
    display: flex; min-height: 92px; background: var(--paper);
    border-bottom: 1px solid var(--line-soft); color: inherit; text-decoration: none;
  }
  .tag:hover .body { background: #f6f8f7; }
  .tape {
    flex: none; width: 64px; padding-right: 10px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  }
  .mark { font-size: 1.85rem; line-height: 1; }
  .unit { font-size: 0.75rem; font-weight: 600; }
  .closed .tape { background-color: #d9ded9; }
  .body { flex: 1; min-width: 0; display: grid; gap: 2px; align-content: center; padding: 0.7rem 1rem 0.7rem 0.9rem; }
  .late .body { background: var(--overdue-soft); }
  .row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
  .customer { font-size: 1.0625rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .number { font-size: 1.125rem; color: var(--muted); flex: none; }
  .items { color: var(--muted); font-size: 0.9375rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 0.875rem; }
  .row.meta { flex-wrap: wrap; row-gap: 0; }
  .state { font-weight: 600; color: #3b4a44; }
  .state.late { color: var(--overdue); font-weight: 700; }
  .balance { font-weight: 700; flex: none; }
  .paid { color: var(--ready); font-weight: 600; flex: none; }
  .loc {
    flex: none; align-self: center; margin-right: 0.9rem; min-width: 44px; height: 44px; padding: 0 8px;
    display: flex; align-items: center; justify-content: center; border-radius: 10px;
    background: var(--ready); color: #fff; font-size: 1.25rem;
  }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
