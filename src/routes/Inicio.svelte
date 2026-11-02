<script>
  // Inicio: the most urgent ticket in big type, then the queue split by what to do next.
  // Phone: "Por terminar" and "Por entregar" are tabs. Wide screens: side by side.
  import TicketCard from '../components/TicketCard.svelte';
  import { listTickets } from '../lib/api.js';
  import { listFilters } from '../lib/filters.svelte.js';
  import { session } from '../lib/session.svelte.js';
  import { isAdmin } from '../lib/permissions.js';
  import { OPEN_STATUSES, formatCOP, todayISO, daysBetween, longDate, statusLabel } from '../lib/format.js';

  let { params } = $props();

  // Tailors start on their own work; the admin starts on everyone's.
  if (listFilters.mine === null) listFilters.mine = !isAdmin(session.profile);

  let tickets = $state([]);
  let loading = $state(true);
  let error = $state('');
  let tab = $state('terminar');
  let request = 0;

  const today = todayISO();
  const searching = $derived(listFilters.q.trim().length > 0);

  // Earliest promised date first; tickets without a date go last (the query already sorts this way).
  const toFinish = $derived(tickets.filter((t) => t.status === 'recibido' || t.status === 'en_proceso'));
  // Longest on the shelf first: those are the customers to call.
  const toDeliver = $derived(
    tickets.filter((t) => t.status === 'listo').toSorted((a, b) => String(a.updated_at).localeCompare(String(b.updated_at))),
  );
  const next = $derived(toFinish[0] ?? null);
  const queue = $derived(toFinish.slice(1));
  const firstUpcoming = $derived(queue.findIndex((t) => t.due_on && daysBetween(today, t.due_on) >= 0));
  const toCollect = $derived(toDeliver.reduce((sum, t) => sum + Math.max(0, t.balance ?? 0), 0));
  const nextDays = $derived(next?.due_on ? daysBetween(today, next.due_on) : null);

  async function load() {
    const id = ++request;
    loading = true;
    error = '';
    try {
      const rows = await listTickets({
        // Every open ticket, not just the first 100: the counts and the queue must be complete.
        q: listFilters.q, mine: listFilters.mine, statuses: OPEN_STATUSES, userId: session.profile.id, limit: 2000,
      });
      if (id === request) tickets = rows;
    } catch (e) {
      if (id === request) error = e.message;
    } finally {
      if (id === request) loading = false;
    }
  }

  // Reload when filters change; typing waits 300 ms.
  $effect(() => {
    const snapshot = [listFilters.q, listFilters.mine];
    const timer = setTimeout(load, snapshot[0] ? 300 : 0);
    return () => clearTimeout(timer);
  });

  const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
</script>

<main class="inicio" class:solo={searching || !next}>
  {#if !searching && next}
    <section class="next" aria-labelledby="next-title">
      <h1 id="next-title">Lo siguiente en tu mesa</h1>
      <a class="tag next-link" href="#/arreglo/{next.id}">
        <span class="next-top">
          <span class="next-number narrow num" aria-label="Arreglo número {next.display_number}">{next.display_number}</span>
          {#if nextDays !== null}
            <span class="next-days" class:late={nextDays < 0}>
              <span class="narrow">{nextDays === 0 ? 'Hoy' : nextDays < 0 ? `−${-nextDays}` : `+${nextDays}`}</span>
              <span class="next-days-label">
                {nextDays === 0 ? 'se entrega' : nextDays < 0 ? `${nextDays === -1 ? 'día' : 'días'} vencido` : nextDays === 1 ? 'día' : 'días'}
              </span>
            </span>
          {/if}
        </span>
        <span class="next-customer">{next.customer_name}</span>
        <span class="next-items">
          {next.items_summary}. {statusLabel(next.status)}{next.balance > 0 ? `, debe ${formatCOP(next.balance)}` : ''}
        </span>
      </a>
      <div class="next-actions">
        <a class="btn next-open" href="#/arreglo/{next.id}">Abrir arreglo</a>
        {#if next.customer_phone}<a class="btn next-call" href={telHref(next.customer_phone)}>Llamar</a>{/if}
      </div>
    </section>
  {/if}

  <div class="tools">
    <a class="btn btn-primary new" href="#/nuevo">+ Nuevo arreglo</a>
    <input
      class="input search" type="search" placeholder="Buscar por N°, nombre o teléfono"
      aria-label="Buscar arreglos" bind:value={listFilters.q} />
    {#if !searching}
      <div class="segmented" role="group" aria-label="De quién">
        <button aria-pressed={listFilters.mine} onclick={() => (listFilters.mine = true)}>Mis arreglos</button>
        <button aria-pressed={!listFilters.mine} onclick={() => (listFilters.mine = false)}>Todos</button>
      </div>
    {/if}
  </div>

  {#if error}
    <p class="error notice" role="alert">No se pudo cargar la lista: {error}. Revisa la conexión y vuelve a intentar.</p>
  {:else if loading && !tickets.length}
    <div class="skeleton" aria-label="Cargando arreglos">{#each [1, 2, 3] as _}<span></span>{/each}</div>
  {:else if searching}
    {#if !tickets.length}
      <div class="empty panel"><h2>No hay arreglos</h2><p class="muted">Ningún arreglo coincide con la búsqueda.</p></div>
    {:else}
      <p class="count muted" aria-live="polite">{tickets.length} {tickets.length === 1 ? 'resultado' : 'resultados'}, de todos los estados</p>
      <ul class="list">{#each tickets as ticket (ticket.id)}<li><TicketCard {ticket} /></li>{/each}</ul>
    {/if}
  {:else}
    <div class="tabs" role="tablist" aria-label="Qué hacer">
      <button role="tab" aria-selected={tab === 'terminar'} onclick={() => (tab = 'terminar')}>
        <span class="narrow">{toFinish.length}</span> Por terminar
      </button>
      <button role="tab" aria-selected={tab === 'entregar'} onclick={() => (tab = 'entregar')}>
        <span class="narrow">{toDeliver.length}</span> Por entregar
      </button>
    </div>

    <div class="cols">
      <section class="col" class:hidden={tab !== 'terminar'} aria-labelledby="h-terminar">
        <header class="col-head">
          <h2 id="h-terminar">Por terminar</h2>
          <span class="muted">En días hasta la entrega</span>
        </header>
        {#if !queue.length}
          <p class="col-empty muted">{next ? 'Solo queda el de arriba.' : 'No hay arreglos por terminar.'}</p>
        {:else}
          <ul class="list">
            {#each queue as ticket, i (ticket.id)}
              {#if i === firstUpcoming && queue[i].due_on && daysBetween(today, queue[i].due_on) === 0}
                <li class="today" aria-hidden="true"><span class="narrow">0</span>Hoy, {longDate(today)}</li>
              {/if}
              <li><TicketCard {ticket} showTailor={!listFilters.mine} /></li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="col" class:hidden={tab !== 'entregar'} aria-labelledby="h-entregar">
        <header class="col-head">
          <h2 id="h-entregar">Por entregar</h2>
          <span class="muted">En días esperando en el estante</span>
        </header>
        {#if !toDeliver.length}
          <p class="col-empty muted">No hay arreglos listos en el estante.</p>
        {:else}
          {#if toCollect > 0}
            <p class="collect"><span>Por cobrar en el estante</span><b class="narrow num">{formatCOP(toCollect)}</b></p>
          {/if}
          <ul class="list">
            {#each toDeliver as ticket (ticket.id)}<li><TicketCard {ticket} mode="waiting" showTailor={!listFilters.mine} /></li>{/each}
          </ul>
        {/if}
      </section>
    </div>

    {#if !next && !toDeliver.length}
      <div class="empty panel">
        <h2>No hay arreglos</h2>
        <p class="muted">Nada pendiente{listFilters.mine ? ' para ti' : ''}. Registra el próximo cuando llegue un cliente.</p>
      </div>
    {/if}
  {/if}
</main>

<style>
  .inicio {
    container-type: inline-size;
    max-width: 1200px; margin: 0 auto; padding: 1rem 1rem 5rem;
    display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr);
  }

  /* Lo siguiente: el bloque verde. */
  .next {
    background: var(--indigo); color: #f5f4ef; border-radius: 24px; padding: 1.25rem;
    display: grid; gap: 1rem;
  }
  .next h1 { font-size: 1.0625rem; font-weight: 600; color: var(--pano-text); }
  .next-link { display: grid; gap: 0.35rem; color: inherit; text-decoration: none; }
  .next-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
  .next-number { font-size: 5rem; line-height: 0.9; }
  .next-days { display: grid; justify-items: end; margin-bottom: 4px; }
  .next-days .narrow { font-size: 2.5rem; line-height: 1; color: var(--thread); }
  .next-days.late .narrow { color: #ff8a7e; }
  .next-days-label { font-size: 0.875rem; font-weight: 600; color: var(--pano-text); }
  .next-days.late .next-days-label { color: #ffc4bd; }
  .next-customer { font-size: 1.375rem; font-weight: 700; line-height: 1.2; }
  .next-items { font-size: 1rem; color: var(--pano-text); }
  .next-actions { display: grid; grid-template-columns: 2fr 1fr; gap: 0.5rem; }
  .next-actions .btn { min-height: 52px; border-radius: 14px; font-size: 1.0625rem; }
  .next-open { background: #f5f4ef; border-color: #f5f4ef; color: var(--indigo); font-weight: 750; }
  .next-call { background: transparent; border-color: #6f8e82; color: #f5f4ef; }
  .next-call:hover { border-color: #f5f4ef; }

  .tools { display: grid; gap: 0.6rem; grid-template-columns: minmax(0, 1fr); }
  .new { min-height: 52px; font-size: 1.0625rem; }
  .search { min-height: 48px; border-radius: 999px; padding-left: 1.1rem; }
  .segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border-radius: 999px; background: #e1e7e4; }
  .segmented button { min-height: 40px; border: 0; border-radius: 999px; background: transparent; font-weight: 600; color: #3b4a44; cursor: pointer; }
  .segmented button[aria-pressed='true'] { background: var(--indigo); color: #fff; font-weight: 750; }

  .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .tabs button {
    display: flex; align-items: baseline; gap: 0.5rem; padding: 0.6rem 0.9rem; min-height: 52px;
    border-radius: 14px; border: 1.5px solid #c9d3ce; background: var(--paper); color: #3b4a44;
    font-weight: 600; text-align: left; cursor: pointer;
  }
  .tabs .narrow { font-size: 1.75rem; line-height: 1; }
  .tabs button[aria-selected='true'] { background: var(--indigo); border-color: var(--indigo); color: #fff; font-weight: 750; }

  .cols { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
  .col { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .col.hidden { display: none; }
  .col-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;
    padding: 1rem 1.1rem 0.75rem; border-bottom: 1px solid var(--line-soft); }
  .col-head .muted { font-size: 0.875rem; }
  .col-empty { padding: 1.25rem 1.1rem; }
  .collect { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;
    margin: 0.75rem 1.1rem; padding: 0.7rem 0.9rem; border-radius: 12px; background: var(--ready-soft); }
  .collect span { font-weight: 700; color: var(--ready); }
  .collect b { font-size: 1.6rem; }

  .list { list-style: none; margin: 0; padding: 0; }
  .search ~ * { min-width: 0; }
  .today { display: flex; align-items: center; height: 34px; background: var(--overdue); color: #fff; font-size: 0.9375rem; font-weight: 700; }
  .today .narrow { width: 64px; text-align: center; font-size: 1.05rem; }

  .count { font-size: 0.875rem; }
  .inicio > .list { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .empty { text-align: center; padding: 2rem 1rem; }
  .notice { background: var(--overdue-soft); border-radius: 12px; padding: 0.75rem 1rem; }
  .skeleton { display: grid; gap: 1px; border-radius: 20px; overflow: hidden; }
  .skeleton span { height: 92px; background: #e3e8e5; }

  /* Pantalla ancha: lo urgente a la izquierda, las dos colas lado a lado, sin pestañas. */
  @container (min-width: 960px) {
    .inicio { grid-template-columns: 360px minmax(0, 1fr); align-items: start; column-gap: 1.5rem; }
    .next { grid-column: 1; grid-row: 1 / span 3; align-self: start; align-content: start; position: sticky; top: 76px; }
    .tools, .cols, .tabs, .notice, .skeleton, .empty, .count, .inicio > .list { grid-column: 2; }
    .tools { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
    .tabs { display: none; }
    .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .col.hidden { display: block; }
    .inicio.solo { grid-template-columns: minmax(0, 1fr); }
    .inicio.solo > * { grid-column: 1; }
  }
</style>
