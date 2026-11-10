<script>
  // Tickets per month as a row of bars, oldest first. Heights are relative to the busiest month;
  // a month with 0 still shows a thin bar so the row never looks broken.
  import { formatCount } from '../lib/format.js';

  let { months = [] } = $props();

  const SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const index = (month) => Number(String(month).slice(5, 7)) - 1;

  const max = $derived(Math.max(0, ...months.map((m) => Number(m.tickets) || 0)));
  const height = (tickets) => (max ? Math.round(((Number(tickets) || 0) / max) * 100) : 0);
</script>

<ul class="bars" aria-label="Arreglos por mes">
  {#each months as m (m.month)}
    <li class:zero={!Number(m.tickets)}>
      <b class="count narrow num">{formatCount(m.tickets)}</b>
      <span class="track" aria-hidden="true"><span class="bar" style:height="{height(m.tickets)}%"></span></span>
      <span class="month">{SHORT[index(m.month)]}<span class="sr-only"> de {m.month.slice(0, 4)}, arreglos recibidos en {MONTHS[index(m.month)]}</span></span>
    </li>
  {/each}
</ul>

<style>
  .bars { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.5rem; }
  li { display: grid; grid-template-rows: auto 88px auto; justify-items: center; gap: 0.3rem; min-width: 0; }
  .count { font-size: 1.05rem; color: var(--ink); }
  .track { width: 100%; max-width: 44px; height: 100%; display: flex; align-items: flex-end;
    border-bottom: 2px solid var(--line); }
  .bar { width: 100%; min-height: 4px; border-radius: 6px 6px 0 0; background: var(--indigo); }
  li.zero .bar { background: var(--line); }
  li:last-child .count { color: var(--indigo); }
  .month { font-size: 0.875rem; color: var(--muted); font-weight: 600; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
