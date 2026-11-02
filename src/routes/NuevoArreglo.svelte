<script>
  import CustomerPicker from '../components/CustomerPicker.svelte';
  import ItemLines from '../components/ItemLines.svelte';
  import { createTicket, listTailors } from '../lib/api.js';
  import { session } from '../lib/session.svelte.js';
  import { isAdmin } from '../lib/permissions.js';
  import { formatCOP, todayISO } from '../lib/format.js';
  import { validateTicketForm } from '../lib/ticket-form.js';

  let { params } = $props();

  const emptyForm = () => ({
    customer: null,
    received_on: todayISO(),
    due_on: '',
    assigned_to: isAdmin(session.profile) ? '' : session.profile.id,
    depositText: '',
    warranty: false,
    notes: '',
    items: [{ garment: '', fix: '', notes: '', costText: '' }],
  });

  let form = $state(emptyForm());
  let tailors = $state([]);
  let submitted = $state(false);
  let saving = $state(false);
  let serverError = $state('');
  let created = $state(null);

  listTailors().then((rows) => (tailors = rows)).catch((e) => (serverError = e.message));

  const check = $derived(validateTicketForm(form));
  const shown = $derived(submitted ? check.errors : { items: {} });
  const balance = $derived(check.total - (check.value.deposit || 0));

  async function save(event) {
    event.preventDefault();
    submitted = true;
    serverError = '';
    if (!check.ok) return;
    saving = true;
    try {
      created = await createTicket(check.value);
    } catch (e) {
      serverError = e.message;
    } finally {
      saving = false;
    }
  }

  function another() {
    form = emptyForm();
    submitted = false;
    created = null;
    window.scrollTo(0, 0);
  }
</script>

{#if created}
  <main class="page done">
    <p class="muted">Arreglo guardado</p>
    <div class="bignumber" aria-label="Arreglo número {created.display_number}">
      <span class="label">N°</span>
      <span class="num">{created.display_number}</span>
    </div>
    <p>Escribe este número en el recibo de <strong>{created.customer_name}</strong>.</p>
    <p class="muted num">Total {formatCOP(created.total)}, saldo {formatCOP(created.balance)}</p>
    <div class="actions">
      <a class="btn btn-indigo" href="#/arreglo/{created.id}">Ver arreglo</a>
      <button class="btn" onclick={another}>Nuevo arreglo</button>
    </div>
  </main>
{:else}
  <main class="page">
    <h1>Nuevo arreglo</h1>
    <form onsubmit={save} novalidate>
      <section class="panel">
        <CustomerPicker bind:customer={form.customer} />
        {#if shown.customer}<p class="error">{shown.customer}</p>{/if}
      </section>

      <section class="panel">
        <h2>Prendas</h2>
        <ItemLines bind:items={form.items} warranty={form.warranty} errors={shown.items} />
        <label class="check">
          <input type="checkbox" name="warranty" bind:checked={form.warranty} />
          Garantía (no se cobra)
        </label>
      </section>

      <section class="panel">
        <div class="two">
          <label class="field">
            <span>Recibido</span>
            <input class="input" type="date" name="received_on" bind:value={form.received_on} required />
          </label>
          <label class="field">
            <span>Entrega estimada</span>
            <input class="input" type="date" name="due_on" bind:value={form.due_on} />
          </label>
        </div>
        {#if check.warning}<p class="warning" role="status">{check.warning}</p>{/if}
        <label class="field">
          <span>Lo hace</span>
          <select class="input" name="assigned_to" bind:value={form.assigned_to}>
            <option value="" disabled>Elige</option>
            {#each tailors as tailor (tailor.id)}<option value={tailor.id}>{tailor.full_name}</option>{/each}
          </select>
        </label>
        {#if shown.assigned_to}<p class="error">{shown.assigned_to}</p>{/if}
        <label class="field">
          <span>Notas (opcional)</span>
          <textarea class="input" name="notes" bind:value={form.notes}></textarea>
        </label>
      </section>

      <section class="panel money">
        <div class="row"><span>Total</span><strong class="num">{formatCOP(check.total)}</strong></div>
        <label class="field">
          <span>Abono</span>
          <input class="input num" name="deposit" inputmode="numeric" placeholder="$0" bind:value={form.depositText} />
        </label>
        {#if shown.deposit}<p class="error">{shown.deposit}</p>{/if}
        <div class="row"><span>Saldo</span><strong class="num">{formatCOP(Math.max(balance, 0))}</strong></div>
      </section>

      {#if serverError}<p class="error" role="alert">{serverError}</p>{/if}
      {#if submitted && !check.ok}<p class="error" role="alert">Revisa los campos marcados.</p>{/if}
      <button class="btn btn-primary btn-block save" type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar arreglo'}
      </button>
    </form>
  </main>
{/if}

<style>
  form { display: grid; gap: 1rem; }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .check { display: flex; align-items: center; gap: 0.5rem; min-height: var(--tap); font-weight: 600; }
  .check input { width: 1.25rem; height: 1.25rem; }
  .money .row { display: flex; justify-content: space-between; align-items: baseline; font-size: 1.05rem; }
  .save { min-height: 52px; font-size: 1.05rem; }

  .done { text-align: center; justify-items: center; padding-top: 2.5rem; }
  /* El número sale impreso sobre la cinta métrica, para copiarlo a la boleta de papel. */
  .bignumber {
    display: flex; align-items: baseline; justify-content: center; gap: 0.75rem;
    width: min(100%, 520px); padding: 2.25rem 1.5rem 1rem; border-radius: 8px;
    background:
      repeating-linear-gradient(90deg, var(--tape-ink) 0 1.5px, transparent 1.5px 12px) left top / 100% 16px no-repeat,
      repeating-linear-gradient(90deg, var(--tape-ink) 0 2.5px, transparent 2.5px 60px) left top / 100% 30px no-repeat,
      var(--thread);
    color: var(--ink);
  }
  .bignumber .label { font-size: 1.25rem; font-weight: 700; }
  .bignumber .num { font-size: clamp(5rem, 22vw, 9rem); font-weight: 800; font-stretch: 68%; line-height: 0.9; }
  .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
</style>
