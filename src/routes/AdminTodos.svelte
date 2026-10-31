<script>
  import TicketCard from '../components/TicketCard.svelte';
  import { listAllTickets, exportTickets, listTailors } from '../lib/api.js';
  import { downloadCSV } from '../lib/csv-export.js';
  import { STATUSES, statusLabel, todayISO } from '../lib/format.js';

  let { params } = $props();

  let filters = $state({ tailor: '', statuses: [], from: '', to: '' });
  let tailors = $state([]);
  let tickets = $state([]);
  let page = $state(0);
  let more = $state(false);
  let loading = $state(true);
  let exporting = $state(false);
  let error = $state('');
  let request = 0;

  listTailors().then((rows) => (tailors = rows)).catch((e) => (error = e.message));

  async function load(reset = true) {
    const id = ++request;
    loading = true;
    error = '';
    try {
      const nextPage = reset ? 0 : page + 1;
      const rows = await listAllTickets($state.snapshot(filters), nextPage);
      if (id !== request) return;
      tickets = reset ? rows : [...tickets, ...rows];
      page = nextPage;
      more = rows.length === 500;
    } catch (e) {
      if (id === request) error = e.message;
    } finally {
      if (id === request) loading = false;
    }
  }

  $effect(() => {
    const snapshot = [filters.tailor, filters.statuses.join(), filters.from, filters.to];
    load(true);
  });

  function toggleStatus(status) {
    filters.statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
  }

  async function exportCSV() {
    exporting = true;
    error = '';
    try {
      downloadCSV(await exportTickets($state.snapshot(filters)), `arreglos-${todayISO()}.csv`);
    } catch (e) {
      error = e.message;
    } finally {
      exporting = false;
    }
  }
</script>

<main class="page">
  <div class="title">
    <h1>Todos los arreglos</h1>
    <button class="btn btn-indigo" onclick={exportCSV} disabled={exporting}>
      {exporting ? 'Exportando…' : 'Exportar CSV'}
    </button>
  </div>

  <section class="panel">
    <label class="field">
      <span>Sastre</span>
      <select class="input" bind:value={filters.tailor}>
        <option value="">Todos</option>
        {#each tailors as t (t.id)}<option value={t.id}>{t.full_name}</option>{/each}
      </select>
    </label>
    <div class="two">
      <label class="field"><span>Recibido desde</span><input class="input" type="date" bind:value={filters.from} /></label>
      <label class="field"><span>Hasta</span><input class="input" type="date" bind:value={filters.to} /></label>
    </div>
    <div class="chips" role="group" aria-label="Estados">
      {#each STATUSES as status}
        <button class="chip" aria-pressed={filters.statuses.includes(status)} onclick={() => toggleStatus(status)}>
          {statusLabel(status)}
        </button>
      {/each}
    </div>
    <p class="muted small">El CSV incluye todos los arreglos que coinciden con estos filtros. Descárgalo cada semana como copia de seguridad.</p>
  </section>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if !tickets.length && !loading}
    <p class="muted">No hay arreglos con estos filtros.</p>
  {:else}
    <ul class="list">
      {#each tickets as ticket (ticket.id)}<li><TicketCard {ticket} /></li>{/each}
    </ul>
    {#if more}
      <button class="btn btn-block" onclick={() => load(false)} disabled={loading}>Cargar más</button>
    {/if}
  {/if}
  {#if loading}<p class="muted">Cargando…</p>{/if}
</main>

<style>
  .title { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chip {
    min-height: 36px; padding: 0 0.8rem; border-radius: 999px; border: 1px solid var(--line);
    background: var(--paper); font-size: 0.875rem; cursor: pointer;
  }
  .chip[aria-pressed='true'] { background: var(--indigo-soft); border-color: var(--indigo); color: var(--indigo); font-weight: 650; }
  .small { font-size: 0.85rem; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
</style>
