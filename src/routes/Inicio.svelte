<script>
  import TicketCard from '../components/TicketCard.svelte';
  import { listTickets } from '../lib/api.js';
  import { listFilters } from '../lib/filters.svelte.js';
  import { session } from '../lib/session.svelte.js';
  import { isAdmin } from '../lib/permissions.js';
  import { STATUSES, statusLabel } from '../lib/format.js';

  let { params } = $props();

  // Tailors start on their own work; the admin starts on everyone's.
  if (listFilters.mine === null) listFilters.mine = !isAdmin(session.profile);

  let tickets = $state([]);
  let loading = $state(true);
  let error = $state('');
  let request = 0;

  const searching = $derived(listFilters.q.trim().length > 0);

  async function load() {
    const id = ++request;
    loading = true;
    error = '';
    try {
      const rows = await listTickets({
        q: listFilters.q, mine: listFilters.mine, statuses: listFilters.statuses, userId: session.profile.id,
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
    const snapshot = [listFilters.q, listFilters.mine, listFilters.statuses.join()];
    const timer = setTimeout(load, snapshot[0] ? 300 : 0);
    return () => clearTimeout(timer);
  });

  function toggleStatus(status) {
    listFilters.statuses = listFilters.statuses.includes(status)
      ? listFilters.statuses.filter((s) => s !== status)
      : [...listFilters.statuses, status];
  }
</script>

<main class="page">
  <a class="btn btn-primary btn-block new" href="#/nuevo">+ Nuevo arreglo</a>

  <input
    class="input search" type="search" placeholder="Buscar por número, nombre o teléfono"
    aria-label="Buscar arreglos" bind:value={listFilters.q} />

  {#if !searching}
    <div class="filters">
      <div class="segmented" role="group" aria-label="Qué arreglos ver">
        <button aria-pressed={listFilters.mine} onclick={() => (listFilters.mine = true)}>Mis arreglos</button>
        <button aria-pressed={!listFilters.mine} onclick={() => (listFilters.mine = false)}>Todos</button>
      </div>
      <div class="chips" role="group" aria-label="Estados">
        {#each STATUSES as status}
          <button class="chip" aria-pressed={listFilters.statuses.includes(status)} onclick={() => toggleStatus(status)}>
            {statusLabel(status)}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">No se pudo cargar la lista: {error}</p>
  {:else if loading && !tickets.length}
    <p class="muted">Cargando…</p>
  {:else if !tickets.length}
    <div class="empty panel">
      <h2>No hay arreglos</h2>
      <p class="muted">
        {searching ? 'Ningún arreglo coincide con la búsqueda.' : 'Cambia los filtros o registra un arreglo nuevo.'}
      </p>
    </div>
  {:else}
    <p class="count muted" aria-live="polite">
      {tickets.length === 100 ? 'Mostrando los primeros 100' : `${tickets.length} ${tickets.length === 1 ? 'arreglo' : 'arreglos'}`}
    </p>
    <ul class="list">
      {#each tickets as ticket (ticket.id)}
        <li><TicketCard {ticket} showTailor={!listFilters.mine || searching} /></li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .new { font-size: 1.05rem; min-height: 52px; }
  .search { min-height: 48px; }
  .filters { display: grid; gap: 0.6rem; }
  .segmented { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); border-radius: var(--radius-control); overflow: hidden; }
  .segmented button { min-height: 40px; border: 0; background: var(--paper); font-weight: 600; cursor: pointer; }
  .segmented button[aria-pressed='true'] { background: var(--indigo); color: #fff; }
  .chips { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    white-space: nowrap; min-height: 36px; padding: 0 0.8rem; border-radius: 999px;
    border: 1px solid var(--line); background: var(--paper); font-size: 0.875rem; cursor: pointer;
  }
  .chip[aria-pressed='true'] { background: var(--indigo-soft); border-color: var(--indigo); color: var(--indigo); font-weight: 650; }
  .count { font-size: 0.875rem; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .empty { text-align: center; padding: 2rem 1rem; }
</style>
