<script>
  // Inicio: the most urgent ticket in big type, then the queue split by what to do next.
  // Phone: "Por terminar" and "Por entregar" are tabs. Wide screens: side by side.
  import TicketCard from '../components/TicketCard.svelte';
  import Modal from '../components/Modal.svelte';
  import { slide, fly } from 'svelte/transition';
  import { notify } from '../lib/toast.svelte.js';
  import { listTickets, updateTicket } from '../lib/api.js';
  import { listFilters } from '../lib/filters.svelte.js';
  import { session } from '../lib/session.svelte.js';
  import { isAdmin } from '../lib/permissions.js';
  import {
    OPEN_STATUSES, STALE_DAYS, formatCOP, todayISO, daysBetween, longDate, statusLabel, isStale, readySince,
  } from '../lib/format.js';

  let { params } = $props();

  // Tailors start on their own work; the admin starts on everyone's.
  if (listFilters.mine === null) listFilters.mine = !isAdmin(session.profile);

  let tickets = $state([]);
  let loading = $state(true);
  let error = $state('');
  let tab = $state('terminar');
  // Panes slide in only after the person switches tabs, never on first load.
  let switched = $state(false);
  let reviewOpen = $state(false);
  function chooseTab(next) { if (next !== tab) { tab = next; switched = true; } }
  let request = 0;

  const today = todayISO();
  const searching = $derived(listFilters.q.trim().length > 0);

  // Old backlog (late or on the shelf for more than STALE_DAYS) is kept apart so the daily queue stays about today.
  const stale = $derived(tickets.filter((t) => isStale(t, today)));
  const fresh = $derived(tickets.filter((t) => !isStale(t, today)));
  // Earliest promised date first; tickets without a date go last (the query already sorts this way).
  const toFinish = $derived(fresh.filter((t) => t.status === 'recibido' || t.status === 'en_proceso'));
  // Longest on the shelf first: those are the customers to call.
  const toDeliver = $derived(
    fresh.filter((t) => t.status === 'listo').toSorted((a, b) => readySince(a).localeCompare(readySince(b))),
  );
  const admin = $derived(isAdmin(session.profile));

  // Admin clean-up of the old backlog: mark several as delivered or cancelled at once.
  let picked = $state(new Set());
  let bulkAction = $state(null); // 'entregado' | 'cancelado'
  let bulkOpen = $state(false);
  let bulkDone = $state(0);
  let bulkError = $state('');
  let bulkBusy = $state(false);
  const allPicked = $derived(stale.length > 0 && stale.every((t) => picked.has(t.id)));

  function togglePick(id) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    picked = next;
  }
  function toggleAll() { picked = allPicked ? new Set() : new Set(stale.map((t) => t.id)); }
  function askBulk(action) { bulkAction = action; bulkError = ''; bulkDone = 0; bulkOpen = true; }

  async function runBulk() {
    bulkBusy = true;
    bulkError = '';
    const chosen = stale.filter((t) => picked.has(t.id));
    try {
      for (const t of chosen) {
        // The real delivery date was never recorded; the promised date stands in so this week's totals stay honest.
        const patch = bulkAction === 'entregado'
          ? { status: 'entregado', delivered_on: t.due_on ?? t.received_on }
          : { status: 'cancelado' };
        await updateTicket(t.id, patch);
        bulkDone++;
      }
      bulkOpen = false;
      picked = new Set();
      notify(bulkAction === 'entregado'
        ? `${chosen.length} ${chosen.length === 1 ? 'marcado como entregado' : 'marcados como entregados'}`
        : `${chosen.length} ${chosen.length === 1 ? 'arreglo cancelado' : 'arreglos cancelados'}`);
      await load();
    } catch (e) {
      bulkError = `Se guardaron ${bulkDone} de ${chosen.length}. ${e.message}`;
    } finally {
      bulkBusy = false;
    }
  }
  const next = $derived(toFinish[0] ?? null);
  const queue = $derived(toFinish.slice(1));
  const firstUpcoming = $derived(queue.findIndex((t) => t.due_on && daysBetween(today, t.due_on) >= 0));
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

<main class="inicio" class:solo={searching || !next} class:switched class:to-right={tab === 'entregar'}>
<div class="layout">
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
    <div class="skeleton" aria-label="Cargando arreglos">{#each [1, 2, 3] as _}<span class="loading-row"></span>{/each}</div>
  {:else if searching}
    {#if !tickets.length}
      <div class="empty panel"><h2>No hay arreglos</h2><p class="muted">Ningún arreglo coincide con la búsqueda.</p></div>
    {:else}
      <p class="count muted" aria-live="polite">{tickets.length} {tickets.length === 1 ? 'resultado' : 'resultados'}, de todos los estados</p>
      <ul class="list">{#each tickets as ticket (ticket.id)}<li><TicketCard {ticket} /></li>{/each}</ul>
    {/if}
  {:else}
    <div class="tabs" role="tablist" aria-label="Qué hacer">
      <span class="pill" class:right={tab === 'entregar'} aria-hidden="true"></span>
      <button role="tab" aria-selected={tab === 'terminar'} onclick={() => chooseTab('terminar')}>
        {#key toFinish.length}<span class="narrow" in:fly={{ y: -8, duration: 240 }}>{toFinish.length}</span>{/key} Por terminar
      </button>
      <button role="tab" aria-selected={tab === 'entregar'} onclick={() => chooseTab('entregar')}>
        {#key toDeliver.length}<span class="narrow" in:fly={{ y: -8, duration: 240 }}>{toDeliver.length}</span>{/key} Por entregar
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
              <li out:slide={{ duration: 280 }}><TicketCard {ticket} showTailor={!listFilters.mine} /></li>
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
          <ul class="list">
            {#each toDeliver as ticket (ticket.id)}<li out:slide={{ duration: 280 }}><TicketCard {ticket} mode="waiting" showTailor={!listFilters.mine} /></li>{/each}
          </ul>
        {/if}
      </section>
    </div>

    {#if stale.length}
      <section class="review" class:open={reviewOpen}>
        <button class="review-head" aria-expanded={reviewOpen} aria-controls="review-body" onclick={() => (reviewOpen = !reviewOpen)}>
          <span class="review-title">Por revisar {#key stale.length}<span class="narrow" in:fly={{ y: -8, duration: 240 }}>{stale.length}</span>{/key}</span>
          <span class="muted">Atrasados o listos hace más de {STALE_DAYS} días. Probablemente ya se entregaron y no se anotó.</span>
          <span class="review-toggle">{reviewOpen ? 'Ocultar' : 'Ver'}
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></span>
        </button>
        <div class="review-body" id="review-body" inert={!reviewOpen}><div>
        {#if admin}
          <div class="bulk">
            <label class="pick-all"><input type="checkbox" checked={allPicked} onchange={toggleAll} /> Elegir todos</label>
            <span class="muted">{picked.size} elegidos</span>
            <button class="btn" disabled={!picked.size} onclick={() => askBulk('entregado')}>Marcar como entregados</button>
            <button class="btn btn-danger" disabled={!picked.size} onclick={() => askBulk('cancelado')}>Cancelar</button>
          </div>
        {/if}
        <ul class="list">
          {#each stale as ticket (ticket.id)}
            <li class:pickable={admin} out:slide={{ duration: 280 }}>
              {#if admin}
                <label class="pick"><input type="checkbox" checked={picked.has(ticket.id)} onchange={() => togglePick(ticket.id)}
                  aria-label="Elegir el arreglo {ticket.display_number}" /></label>
              {/if}
              <TicketCard {ticket} mode="waiting" showTailor={!listFilters.mine} />
            </li>
          {/each}
        </ul>
        </div></div>
      </section>
    {/if}

    {#if !next && !toDeliver.length && !stale.length}
      <div class="empty panel">
        <h2>No hay arreglos</h2>
        <p class="muted">Nada pendiente{listFilters.mine ? ' para ti' : ''}. Registra el próximo cuando llegue un cliente.</p>
      </div>
    {/if}
  {/if}
</div>
</main>

<Modal bind:open={bulkOpen} title={bulkAction === 'entregado' ? `¿Marcar ${picked.size} como entregados?` : `¿Cancelar ${picked.size} arreglos?`}>
  <p>{bulkAction === 'entregado'
    ? 'Quedarán como entregados con su fecha prometida como fecha de entrega, porque la real no se anotó. No cambia lo que se cobró.'
    : 'Quedarán como cancelados. Siguen guardados y se pueden ver en Todos los arreglos.'}</p>
  {#if bulkBusy}
    <div class="progress" aria-hidden="true"><div class="tape" style="width: {(bulkDone / Math.max(picked.size, 1)) * 100}%"></div></div>
    <p class="muted" role="status">Guardando {bulkDone} de {picked.size}…</p>
  {/if}
  {#if bulkError}<p class="error" role="alert">{bulkError}</p>{/if}
  <div class="modal-actions">
    <button class="btn" onclick={() => (bulkOpen = false)} disabled={bulkBusy}>Volver</button>
    <button class="btn" class:btn-indigo={bulkAction === 'entregado'} class:btn-danger={bulkAction === 'cancelado'}
      onclick={runBulk} disabled={bulkBusy}>{bulkAction === 'entregado' ? 'Marcar entregados' : 'Cancelar arreglos'}</button>
  </div>
</Modal>

<style>
  /* .inicio is the container whose width is queried; .layout is the grid that responds to it.
     (An element cannot respond to a query on its own width.) */
  .inicio { container-type: inline-size; max-width: 1200px; margin: 0 auto; padding: 1rem 1rem 5rem; }
  .layout { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }

  /* Lo siguiente: el bloque verde. */
  .next {
    background: var(--indigo); color: #f5f4ef; border-radius: 24px; padding: 1.25rem;
    display: grid; gap: 1rem;
    /* Its own width decides the size of the big number, so nothing spills out at any zoom or text size. */
    container-type: inline-size; min-width: 0;
  }
  .next h1 { font-size: 1.0625rem; font-weight: 600; color: var(--pano-text); }
  .next-link { display: grid; gap: 0.35rem; color: inherit; text-decoration: none; }
  .next-top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 0.25rem 1rem; min-width: 0; }
  .next-number { font-size: min(5rem, 30cqi); line-height: 0.9; }
  .next-days { display: grid; justify-items: end; margin-bottom: 4px; }
  .next-days .narrow { font-size: min(2.5rem, 15cqi); line-height: 1; color: var(--thread); }
  .next-days.late .narrow { color: #ff8a7e; }
  .next-days-label { font-size: 0.875rem; font-weight: 600; color: var(--pano-text); }
  .next-days.late .next-days-label { color: #ffc4bd; }
  .next-customer { font-size: 1.375rem; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
  .next-items { font-size: 1rem; color: var(--pano-text); }
  .next-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .next-actions .next-open { flex: 2 1 9rem; }
  .next-actions .next-call { flex: 1 1 6rem; }
  .next-actions .btn { min-height: 52px; border-radius: 14px; font-size: 1.0625rem; white-space: nowrap; }
  .next-open { background: #f5f4ef; border-color: #f5f4ef; color: var(--indigo); font-weight: 750; }
  .next-call { background: transparent; border-color: #6f8e82; color: #f5f4ef; }
  .next-call:hover { border-color: #f5f4ef; }

  .tools { display: grid; gap: 0.6rem; grid-template-columns: minmax(0, 1fr); }
  .new { min-height: 52px; font-size: 1.0625rem; }
  .search { min-height: 48px; border-radius: 999px; padding-left: 1.1rem; }
  .segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border-radius: 999px; background: #e1e7e4; }
  .segmented button { min-height: 40px; border: 0; border-radius: 999px; background: transparent; font-weight: 600; color: #3b4a44; cursor: pointer; }
  .segmented button[aria-pressed='true'] { background: var(--indigo); color: #fff; font-weight: 750; }

  /* Pestañas: una marca verde que se desliza a la elegida. */
  .tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 4px; border-radius: 999px; background: #e1e7e4; }
  .tabs .pill { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 999px;
    background: var(--indigo); transition: transform var(--base) var(--ease); }
  .tabs .pill.right { transform: translateX(100%); }
  .tabs button {
    position: relative; z-index: 1; display: flex; align-items: baseline; justify-content: center; gap: 0.5rem; min-height: 48px;
    border: 0; border-radius: 999px; background: transparent; color: #3b4a44; font-weight: 650; cursor: pointer;
    transition: color var(--base);
  }
  .tabs .narrow { display: inline-block; font-size: 1.6rem; line-height: 1; }
  .tabs button[aria-selected='true'] { color: #fff; font-weight: 750; }
  @keyframes pane-from-left { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
  @keyframes pane-from-right { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
  .switched .col:not(.hidden) { animation: pane-from-left var(--base) var(--ease); }
  .switched.to-right .col:not(.hidden) { animation-name: pane-from-right; }

  .cols { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
  .col { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .col.hidden { display: none; }
  .col-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;
    padding: 1rem 1.1rem 0.75rem; border-bottom: 1px solid var(--line-soft); }
  .col-head .muted { font-size: 0.875rem; }
  .col-empty { padding: 1.25rem 1.1rem; }

  .list { list-style: none; margin: 0; padding: 0; }
  .search ~ * { min-width: 0; }
  .today { display: flex; align-items: center; height: 34px; background: var(--overdue); color: #fff; font-size: 0.9375rem; font-weight: 700; }
  .today .narrow { width: 64px; text-align: center; font-size: 1.05rem; }

  .count { font-size: 0.875rem; }
  .layout > .list { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .empty { text-align: center; padding: 2rem 1rem; }
  .notice { background: var(--overdue-soft); border-radius: 12px; padding: 0.75rem 1rem; }
  .review { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
  .review-head { width: 100%; display: grid; gap: 0.2rem; padding: 1rem 1.1rem; border: 0; background: none;
    font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .review-toggle { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 700; color: var(--indigo); font-size: 0.9375rem; }
  .review .chev { transition: transform var(--base) var(--ease); }
  .review.open .chev { transform: rotate(180deg); }
  /* Se abre de forma continua: la altura crece en vez de saltar. */
  .review-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 280ms var(--ease); }
  .review.open .review-body { grid-template-rows: 1fr; }
  .review-body > div { overflow: hidden; min-height: 0; }
  .progress { height: 22px; border-radius: 5px; background: var(--chalk); overflow: hidden; margin-top: 0.75rem; }
  .progress .tape { height: 100%; transition: width 200ms linear; }
  .review-title { font-size: 1.2rem; font-weight: 800; display: flex; align-items: baseline; gap: 0.5rem; }
  .review-title .narrow { font-size: 1.5rem; color: var(--muted); }
  .review-head .muted { font-size: 0.875rem; }
  .bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; padding: 0.75rem 1.1rem;
    border-top: 1px solid var(--line-soft); background: #f6f8f7; }
  .pick-all { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; font-weight: 600; margin-right: auto; }
  .pickable { display: flex; align-items: stretch; }
  .pickable :global(.tag) { flex: 1; min-width: 0; }
  .pick { flex: none; display: flex; align-items: center; justify-content: center; width: 52px;
    border-bottom: 1px solid var(--line-soft); background: var(--paper); }
  .pick input, .pick-all input { width: 22px; height: 22px; accent-color: var(--indigo); }
  .modal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
  .skeleton { display: grid; gap: 1px; border-radius: 20px; overflow: hidden; }
  .skeleton span { height: 92px; }

  /* Pantalla ancha: lo urgente a la izquierda, las dos colas lado a lado, sin pestañas. */
  @container (min-width: 960px) {
    .layout { grid-template-columns: minmax(18rem, 30%) minmax(0, 1fr); align-items: start; column-gap: 1.5rem; }
    .next { grid-column: 1; grid-row: 1 / span 3; align-self: start; align-content: start; position: sticky; top: 76px; }
    .tools, .cols, .tabs, .notice, .skeleton, .empty, .count, .review, .layout > .list { grid-column: 2; }
    .tools { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
    .tabs { display: none; }
    .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .col.hidden { display: block; }
    .solo .layout { grid-template-columns: minmax(0, 1fr); }
    .solo .layout > * { grid-column: 1; }
  }
</style>
