<script>
  import StatusBadge from '../components/StatusBadge.svelte';
  import Modal from '../components/Modal.svelte';
  import LocationPicker from '../components/LocationPicker.svelte';
  import ItemLines from '../components/ItemLines.svelte';
  import {
    getTicket, profileNames, updateTicket, replaceItems, deleteTicket, listTailors,
  } from '../lib/api.js';
  import { session } from '../lib/session.svelte.js';
  import { navigate } from '../lib/router.svelte.js';
  import { canEditCore, canDelete } from '../lib/permissions.js';
  import {
    formatCOP, formatDate, locationLabel, parseCOPInput, todayISO, daysBetween, tapeMark, dueText,
  } from '../lib/format.js';
  import { validateTicketForm, finalPriceChange } from '../lib/ticket-form.js';

  let { params } = $props();

  let ticket = $state(null);
  let items = $state([]);
  let names = $state({});
  let tailors = $state([]);
  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);

  let readyOpen = $state(false);
  let location = $state(null);
  let deliverOpen = $state(false);
  let delivery = $state({ pickedUpBy: '', finalText: '', paid: true, error: '' });
  let payOpen = $state(false);
  let payment = $state({ depositText: '', paid: false, error: '' });
  let editing = $state(false);
  let editForm = $state(null);
  let editSubmitted = $state(false);

  const editable = $derived(ticket && canEditCore(session.profile, ticket));
  const open = $derived(ticket && !['entregado', 'cancelado'].includes(ticket.status));
  // The same promise in words and on the tape as in the Inicio list.
  const dueDays = $derived(ticket?.due_on ? daysBetween(todayISO(), ticket.due_on) : null);
  const dueMark = $derived(tapeMark(dueDays, { iso: ticket?.due_on }));
  const editCheck = $derived(editForm ? validateTicketForm(editForm) : null);

  async function load() {
    try {
      const result = await getTicket(params.id);
      if (!result) { error = 'Este arreglo no existe o fue eliminado.'; return; }
      ticket = result.ticket;
      items = result.items;
      if (!Object.keys(names).length) names = await profileNames();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
  load();

  async function run(action) {
    busy = true;
    error = '';
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      error = e.message;
      return false;
    } finally {
      busy = false;
    }
  }

  const start = () => run(() => updateTicket(ticket.id, { status: 'en_proceso' }));

  function openReady() { location = ticket.location; readyOpen = true; }
  async function saveReady() {
    if (!location) return;
    if (await run(() => updateTicket(ticket.id, { status: 'listo', location }))) readyOpen = false;
  }

  function openDeliver() {
    delivery = { pickedUpBy: '', finalText: formatCOP(ticket.total).replace('$', ''), paid: true, error: '' };
    deliverOpen = true;
  }
  async function saveDeliver() {
    delivery.error = '';
    let newItems = null;
    if (editable && !ticket.warranty) {
      let finalValue;
      try { finalValue = parseCOPInput(delivery.finalText); } catch (e) { delivery.error = e.message; return; }
      const change = finalPriceChange(items, finalValue);
      if (change.error) { delivery.error = change.error; return; }
      newItems = change.items;
    }
    const ok = await run(async () => {
      if (newItems) await replaceItems(ticket.id, newItems);
      await updateTicket(ticket.id, {
        status: 'entregado', picked_up_by: delivery.pickedUpBy.trim() || null, paid_in_full: delivery.paid,
      });
    });
    if (ok) deliverOpen = false;
  }

  async function cancelTicket() {
    if (!confirm(`¿Cancelar el arreglo N° ${ticket.display_number}?`)) return;
    await run(() => updateTicket(ticket.id, { status: 'cancelado' }));
  }

  function openPayment() {
    payment = { depositText: String(ticket.deposit), paid: ticket.paid_in_full, error: '' };
    payOpen = true;
  }
  async function savePayment() {
    let deposit;
    try { deposit = parseCOPInput(payment.depositText); } catch (e) { payment.error = e.message; return; }
    if (await run(() => updateTicket(ticket.id, { deposit, paid_in_full: payment.paid }))) payOpen = false;
  }

  async function startEdit() {
    if (!tailors.length) tailors = await listTailors();
    editForm = {
      customer: { id: ticket.customer_id, name: ticket.customer_name },
      received_on: ticket.received_on, due_on: ticket.due_on ?? '', assigned_to: ticket.assigned_to,
      depositText: String(ticket.deposit), warranty: ticket.warranty, notes: ticket.notes ?? '',
      items: items.map((i) => ({ garment: i.garment, fix: i.fix, notes: i.notes ?? '', costText: String(i.cost) })),
    };
    editSubmitted = false;
    editing = true;
  }
  async function saveEdit(event) {
    event.preventDefault();
    editSubmitted = true;
    if (!editCheck.ok) return;
    const v = editCheck.value;
    // Items first: after a reassignment this tailor may no longer edit the lines.
    const ok = await run(async () => {
      await replaceItems(ticket.id, v.items);
      await updateTicket(ticket.id, {
        received_on: v.received_on, due_on: v.due_on, assigned_to: v.assigned_to,
        deposit: v.deposit, warranty: v.warranty, notes: v.notes || null,
      });
    });
    if (ok) editing = false;
  }

  async function remove() {
    if (!confirm(`¿Eliminar el arreglo N° ${ticket.display_number}? Esta acción no se puede deshacer.`)) return;
    if (await run(() => deleteTicket(ticket.id))) navigate('/');
  }
</script>

<main class="page">
  <a class="back" href="#/">← Volver a la lista</a>

  {#if loading}
    <p class="muted">Cargando…</p>
  {:else if !ticket}
    <p class="error" role="alert">{error}</p>
  {:else}
    <section class="head" class:overdue={ticket.overdue}>
      <div class="stub num" aria-label="Arreglo número {ticket.display_number}">
        <span class="label">N°</span>{ticket.display_number}
      </div>
      <div class="who">
        <h1>{ticket.customer_name}</h1>
        {#if ticket.customer_phone}<a class="num" href="tel:{ticket.customer_phone}">{ticket.customer_phone}</a>{/if}
        <div class="line"><StatusBadge status={ticket.status} /> <span class="muted">{ticket.assigned_name}</span></div>
        {#if open && ticket.status !== 'listo'}
          <div class="due" class:late={ticket.overdue} class:today={dueDays === 0}>
            <span class="tape mini narrow" class:late={ticket.overdue} aria-hidden="true">{dueMark.mark}</span>
            <span>{dueText(ticket.due_on)}</span>
          </div>
        {/if}
      </div>
    </section>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if open && !editing}
      <div class="actions">
        {#if ticket.status === 'recibido'}
          <button class="btn btn-primary" onclick={start} disabled={busy}>Empezar</button>
        {:else if ticket.status === 'en_proceso'}
          <button class="btn btn-primary" onclick={openReady} disabled={busy}>Marcar listo</button>
        {:else if ticket.status === 'listo'}
          <button class="btn btn-primary" onclick={openDeliver} disabled={busy}>Entregar</button>
        {/if}
      </div>
    {/if}

    {#if editing}
      <form class="panel" onsubmit={saveEdit} novalidate>
        <h2>Editar arreglo</h2>
        <ItemLines bind:items={editForm.items} warranty={editForm.warranty}
          errors={editSubmitted ? editCheck.errors.items : {}} />
        <label class="check"><input type="checkbox" bind:checked={editForm.warranty} /> Garantía (no se cobra)</label>
        <div class="two">
          <label class="field"><span>Recibido</span>
            <input class="input" type="date" bind:value={editForm.received_on} /></label>
          <label class="field"><span>Entrega estimada</span>
            <input class="input" type="date" bind:value={editForm.due_on} /></label>
        </div>
        {#if editCheck.warning}<p class="warning">{editCheck.warning}</p>{/if}
        <label class="field"><span>Lo hace</span>
          <select class="input" bind:value={editForm.assigned_to}>
            {#each tailors as t (t.id)}<option value={t.id}>{t.full_name}</option>{/each}
          </select></label>
        <label class="field"><span>Abono</span>
          <input class="input num" inputmode="numeric" bind:value={editForm.depositText} /></label>
        {#if editSubmitted && editCheck.errors.deposit}<p class="error">{editCheck.errors.deposit}</p>{/if}
        <label class="field"><span>Notas</span><textarea class="input" bind:value={editForm.notes}></textarea></label>
        <div class="row-actions">
          <button class="btn btn-indigo" type="submit" disabled={busy}>Guardar cambios</button>
          <button class="btn" type="button" onclick={() => (editing = false)}>Descartar</button>
        </div>
      </form>
    {:else}
      <section class="panel">
        <h2>Prendas</h2>
        <ul class="items">
          {#each items as item (item.id)}
            <li>
              <div><strong>{item.garment}</strong>{#if item.fix}<span>{item.fix}</span>{/if}
                {#if item.notes}<span class="muted">{item.notes}</span>{/if}</div>
              <span class="num">{ticket.warranty ? formatCOP(0) : formatCOP(item.cost)}</span>
            </li>
          {/each}
        </ul>
        {#if ticket.warranty}<p class="warning">Garantía: este arreglo no se cobra.</p>{/if}
      </section>

      <section class="panel money">
        <div class="row"><span>Total</span><strong class="num">{formatCOP(ticket.total)}</strong></div>
        <div class="row"><span>Abono</span><span class="num">{formatCOP(ticket.deposit)}</span></div>
        <div class="row balance">
          <span>Saldo</span>
          {#if ticket.paid_in_full}<strong>Pagado</strong>{:else}<strong class="num">{formatCOP(ticket.balance)}</strong>{/if}
        </div>
        <button class="btn" onclick={openPayment} disabled={busy}>Cambiar pago</button>
      </section>

      <section class="panel facts">
        <div><span class="muted">Recibido</span> {formatDate(ticket.received_on)}</div>
        <div class:late={ticket.overdue}><span class="muted">Entrega estimada</span> {formatDate(ticket.due_on) || 'Sin fecha'}</div>
        {#if ticket.delivered_on}<div><span class="muted">Entregado</span> {formatDate(ticket.delivered_on)}</div>{/if}
        {#if ticket.location}<div>Ubicación {locationLabel(ticket.location)}</div>{/if}
        {#if ticket.picked_up_by}<div>Recogió {ticket.picked_up_by}</div>{/if}
        {#if ticket.notes}<div class="notes">{ticket.notes}</div>{/if}
        <div class="muted small">
          {ticket.legacy ? 'Importado de la hoja' : `Registró ${names[ticket.created_by] ?? '—'}`}{#if ticket.updated_by && ticket.updated_by !== ticket.created_by}; último cambio de {names[ticket.updated_by]}{/if}
        </div>
      </section>

      <div class="row-actions">
        {#if editable}<button class="btn" onclick={startEdit} disabled={busy}>Editar</button>{/if}
        {#if open}<button class="btn" onclick={cancelTicket} disabled={busy}>Cancelar arreglo</button>{/if}
        {#if canDelete(session.profile)}<button class="btn btn-danger" onclick={remove} disabled={busy}>Eliminar</button>{/if}
      </div>
    {/if}
  {/if}
</main>

<Modal bind:open={readyOpen} title="¿Dónde queda la prenda?">
  <LocationPicker bind:value={location} />
  <div class="modal-actions">
    <button class="btn btn-primary" onclick={saveReady} disabled={!location || busy}>Guardar ubicación</button>
    <button class="btn" onclick={() => (readyOpen = false)}>Volver</button>
  </div>
</Modal>

<Modal bind:open={deliverOpen} title="Entregar arreglo">
  <div class="stack">
    <label class="field"><span>¿Quién recogió? (opcional)</span>
      <input class="input" name="picked_up_by" bind:value={delivery.pickedUpBy} /></label>
    {#if editable && !ticket?.warranty}
      <label class="field"><span>Valor final</span>
        <input class="input num" name="final_value" inputmode="numeric" bind:value={delivery.finalText} /></label>
    {/if}
    <label class="check"><input type="checkbox" name="paid" bind:checked={delivery.paid} /> Pagado completo</label>
    {#if delivery.error}<p class="error">{delivery.error}</p>{/if}
  </div>
  <div class="modal-actions">
    <button class="btn btn-primary" onclick={saveDeliver} disabled={busy}>Confirmar entrega</button>
    <button class="btn" onclick={() => (deliverOpen = false)}>Volver</button>
  </div>
</Modal>

<Modal bind:open={payOpen} title="Cambiar pago">
  <div class="stack">
    <label class="field"><span>Abono</span>
      <input class="input num" inputmode="numeric" bind:value={payment.depositText} /></label>
    <label class="check"><input type="checkbox" bind:checked={payment.paid} /> Pagado completo</label>
    {#if payment.error}<p class="error">{payment.error}</p>{/if}
  </div>
  <div class="modal-actions">
    <button class="btn btn-primary" onclick={savePayment} disabled={busy}>Guardar pago</button>
    <button class="btn" onclick={() => (payOpen = false)}>Volver</button>
  </div>
</Modal>

<style>
  .back { font-weight: 600; text-decoration: none; }
  .head {
    display: grid; grid-template-columns: auto 1fr; background: var(--paper);
    border: 1px solid var(--line); border-radius: var(--radius-tag); overflow: hidden;
  }
  .stub {
    display: grid; align-content: center; justify-items: center; padding: 1rem 1.1rem;
    background: var(--indigo); color: #f5f4ef; font-size: 2.6rem; font-weight: 800; font-stretch: 68%; line-height: 1;
    min-width: 6rem;
  }
  .stub .label { font-size: 0.8rem; color: #fff; opacity: 0.8; font-weight: 700; }
  .due { display: flex; align-items: center; gap: 0.6rem; font-weight: 700; font-size: 0.9375rem; color: #3b4a44; }
  .due.late { color: var(--overdue); }
  .due.today { color: #7a5a00; }
  .mini { display: inline-flex; align-items: center; min-height: 30px; padding: 0 16px 0 9px; border-radius: 6px; font-size: 1.15rem; }
  .who { padding: 0.85rem 1rem; display: grid; gap: 0.3rem; align-content: center; min-width: 0; }
  .who h1 { font-size: 1.25rem; overflow-wrap: anywhere; }
  .line { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; font-size: 0.9rem; }
  .actions .btn { width: 100%; min-height: 52px; font-size: 1.05rem; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .items li { display: flex; justify-content: space-between; gap: 1rem; }
  .items li div { display: grid; }
  .money .row { display: flex; justify-content: space-between; }
  .money .balance { font-size: 1.1rem; }
  .facts { gap: 0.4rem; }
  .facts .late { color: var(--overdue); font-weight: 700; }
  .notes { white-space: pre-wrap; background: var(--chalk); padding: 0.5rem 0.75rem; border-radius: var(--radius-control); }
  .small { font-size: 0.85rem; }
  .row-actions, .modal-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .modal-actions { margin-top: 1rem; }
  .stack { display: grid; gap: 0.85rem; }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .check { display: flex; align-items: center; gap: 0.5rem; min-height: var(--tap); font-weight: 600; }
  .check input { width: 1.25rem; height: 1.25rem; }
</style>
