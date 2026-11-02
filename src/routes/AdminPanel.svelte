<script>
  import TicketCard from '../components/TicketCard.svelte';
  import { adminTotals, statusCounts, overdueTickets } from '../lib/api.js';
  import { formatCOP, todayISO, startOfWeek, startOfMonth, STATUSES, statusLabel } from '../lib/format.js';

  let { params } = $props();

  const today = todayISO();
  const PERIODS = [
    { key: 'week', label: 'Esta semana', from: startOfWeek(today) },
    { key: 'month', label: 'Este mes', from: startOfMonth(today) },
  ];

  let totals = $state({});
  let counts = $state({});
  let overdue = $state([]);
  let loading = $state(true);
  let error = $state('');

  async function load() {
    try {
      const [week, month, byStatus, late] = await Promise.all([
        adminTotals(PERIODS[0].from, today), adminTotals(PERIODS[1].from, today),
        statusCounts(STATUSES), overdueTickets(),
      ]);
      totals = { week, month };
      counts = byStatus;
      overdue = late;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
  load();

  const sum = (rows, key) => (rows ?? []).reduce((acc, row) => acc + row[key], 0);
</script>

<main class="page page-wide">
  <h1>Panel</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loading}
    <p class="muted">Cargando…</p>
  {:else if !error}
    <div class="periods">
      {#each PERIODS as period}
        <section class="panel money">
          <h2>{period.label}</h2>
          <p class="big num">{formatCOP(sum(totals[period.key], 'money_received'))}</p>
          <p class="muted small">Dinero recibido: abonos y saldos cobrados</p>
          <table>
            <thead><tr><th>Sastre</th><th class="r">Recibido</th><th class="r">Entregas</th></tr></thead>
            <tbody>
              {#each totals[period.key] as row (row.tailor_id)}
                <tr>
                  <td>{row.tailor_name}</td>
                  <td class="r num">{formatCOP(row.money_received)}</td>
                  <td class="r num">{row.delivered_count}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    </div>

    <section class="panel">
      <h2>Arreglos por estado</h2>
      <ul class="counts">
        {#each STATUSES as status}
          <li><span class="num">{counts[status] ?? 0}</span>{statusLabel(status)}</li>
        {/each}
      </ul>
    </section>

    <section class="panel">
      <h2>Por sastre</h2>
      <table>
        <thead><tr><th>Sastre</th><th class="r">Pendientes</th><th class="r">Atrasados</th><th class="r">Garantías del mes</th></tr></thead>
        <tbody>
          {#each totals.month as row (row.tailor_id)}
            <tr>
              <td>{row.tailor_name}</td>
              <td class="r num">{row.open_count}</td>
              <td class="r num" class:late={row.overdue_count > 0}>{row.overdue_count}</td>
              <td class="r num">{row.warranty_count}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="overdue">
      <h2>Atrasados {#if overdue.length}<span class="muted">({overdue.length === 50 ? 'los 50 más antiguos' : overdue.length})</span>{/if}</h2>
      {#if overdue.length}
        <ul class="list">
          {#each overdue as ticket (ticket.id)}<li><TicketCard {ticket} /></li>{/each}
        </ul>
      {:else}
        <p class="muted">No hay arreglos atrasados.</p>
      {/if}
    </section>
  {/if}
</main>

<style>
  .periods { display: grid; gap: 1rem; }
  @media (min-width: 560px) { .periods { grid-template-columns: 1fr 1fr; } }
  .big { font-size: 2rem; font-weight: 850; color: var(--indigo); letter-spacing: -0.01em; }
  .small { font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.925rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--line); padding: 0.3rem 0; }
  td { padding: 0.4rem 0; border-bottom: 1px dashed var(--line); }
  .r { text-align: right; }
  .late { color: var(--overdue); font-weight: 700; }
  .counts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.5rem; }
  .counts li { display: grid; padding: 0.6rem 0.75rem; background: var(--chalk); border-radius: var(--radius-control); font-size: 0.875rem; }
  .counts li span { font-size: 1.4rem; font-weight: 800; color: var(--indigo); }
  .overdue { display: grid; gap: 0.6rem; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; background: var(--paper); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
</style>
