<script>
  // A ticket drawn like the paper claim tag the shop hands out: number on the denim stub, details on the body.
  import StatusBadge from './StatusBadge.svelte';
  import { formatCOP, formatDate, todayISO, locationLabel } from '../lib/format.js';

  let { ticket, showTailor = true } = $props();

  const today = todayISO();
  const open = $derived(!['entregado', 'cancelado'].includes(ticket.status));
  const dueToday = $derived(open && ticket.due_on === today);
  const daysLate = $derived(
    ticket.overdue ? Math.round((Date.parse(today) - Date.parse(ticket.due_on)) / 86_400_000) : 0,
  );
  const dueText = $derived(
    !ticket.due_on ? 'Sin fecha de entrega'
      : ticket.overdue ? `Atrasado ${daysLate} ${daysLate === 1 ? 'día' : 'días'} (${formatDate(ticket.due_on)})`
      : dueToday ? 'Entrega hoy'
      : `Entrega ${formatDate(ticket.due_on)}`,
  );
</script>

<a class="tag" class:overdue={ticket.overdue} class:today={dueToday} href="#/arreglo/{ticket.id}">
  <span class="stub num" aria-label="Arreglo número {ticket.display_number}">
    <span class="hole" aria-hidden="true"></span>
    {ticket.display_number}
  </span>
  <span class="body">
    <span class="row">
      <strong class="customer">{ticket.customer_name}</strong>
      <StatusBadge status={ticket.status} />
    </span>
    <span class="items">{ticket.items_summary}</span>
    <span class="row meta">
      {#if open}<span class="due">{dueText}</span>{:else}<span>Entregado {formatDate(ticket.delivered_on)}</span>{/if}
      {#if ticket.balance > 0}<span class="balance num">Debe {formatCOP(ticket.balance)}</span>{/if}
    </span>
    {#if showTailor || ticket.location}
      <span class="row meta muted">
        {#if showTailor}<span>{ticket.assigned_name}</span>{/if}
        {#if ticket.location && ticket.status === 'listo'}<span>Ubicación {locationLabel(ticket.location)}</span>{/if}
      </span>
    {/if}
  </span>
</a>

<style>
  .tag {
    display: grid; grid-template-columns: 5.25rem 1fr;
    background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-tag);
    color: inherit; text-decoration: none; overflow: hidden;
  }
  .tag:hover { border-color: var(--indigo); }
  .stub {
    position: relative; display: grid; place-items: center;
    background: var(--indigo); color: var(--thread);
    font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em;
    border-right: 2px dashed var(--thread); padding: 1.25rem 0.25rem 0.75rem;
  }
  .hole {
    position: absolute; top: 0.55rem; left: 50%; translate: -50% 0;
    width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--chalk);
  }
  .body { display: grid; gap: 0.2rem; padding: 0.7rem 0.85rem; min-width: 0; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
  .customer { font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .items { color: var(--ink); font-size: 0.925rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 0.85rem; }
  .balance { font-weight: 700; }
  .overdue { border-color: var(--overdue); box-shadow: inset 4px 0 0 var(--overdue); }
  .overdue .stub { background: var(--overdue); color: #fff; border-right-color: #fff; }
  .overdue .due { color: var(--overdue); font-weight: 700; }
  .today { border-color: var(--thread); }
  .today .due { color: #8a5a00; font-weight: 700; }
</style>
