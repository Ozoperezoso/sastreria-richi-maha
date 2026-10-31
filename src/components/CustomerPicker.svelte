<script>
  // Find a returning customer by name or phone, or start a new one from what was typed.
  import { searchCustomers } from '../lib/api.js';

  /** customer: {id, name, phone} for an existing one, {id: null, name, phone} for a new one, or null */
  let { customer = $bindable(null) } = $props();

  let query = $state('');
  let matches = $state([]);
  let searching = $state(false);

  $effect(() => {
    const q = query;
    if (q.trim().length < 2) { matches = []; return; }
    const timer = setTimeout(async () => {
      searching = true;
      try { matches = await searchCustomers(q); } finally { searching = false; }
    }, 250);
    return () => clearTimeout(timer);
  });

  const looksLikePhone = $derived(/^[\d\s+()-]{3,}$/.test(query.trim()));

  function pick(existing) {
    customer = { id: existing.id, name: existing.name, phone: existing.phone };
  }
  function startNew() {
    customer = looksLikePhone
      ? { id: null, name: '', phone: query.trim() }
      : { id: null, name: query.trim(), phone: '' };
  }
  function change() {
    query = customer?.name || customer?.phone || '';
    customer = null;
  }
</script>

{#if customer?.id}
  <div class="chosen">
    <div>
      <strong>{customer.name}</strong>
      {#if customer.phone}<span class="muted num">{customer.phone}</span>{/if}
    </div>
    <button type="button" class="btn" onclick={change}>Cambiar</button>
  </div>
{:else if customer}
  <div class="newcustomer">
    <label class="field">
      <span>Nombre del cliente</span>
      <input class="input" name="customer_name" bind:value={customer.name} autocomplete="off" required />
    </label>
    <label class="field">
      <span>Teléfono (opcional)</span>
      <input class="input num" name="customer_phone" type="tel" inputmode="tel" bind:value={customer.phone} autocomplete="off" />
    </label>
    <button type="button" class="link" onclick={change}>Buscar un cliente existente</button>
  </div>
{:else}
  <label class="field">
    <span>Cliente</span>
    <input class="input" name="customer_search" placeholder="Nombre o teléfono" autocomplete="off" bind:value={query} />
  </label>
  {#if query.trim().length >= 2}
    <ul class="matches" aria-label="Clientes encontrados">
      {#each matches as match (match.id)}
        <li>
          <button type="button" onclick={() => pick(match)}>
            <strong>{match.name}</strong>
            {#if match.phone}<span class="muted num">{match.phone}</span>{/if}
          </button>
        </li>
      {/each}
      <li>
        <button type="button" class="create" onclick={startNew}>
          Nuevo cliente: <strong>{query.trim()}</strong>
        </button>
      </li>
    </ul>
    {#if searching}<p class="muted small">Buscando…</p>{/if}
  {/if}
{/if}

<style>
  .chosen {
    display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
    padding: 0.6rem 0.75rem; border: 1px solid var(--indigo); border-radius: var(--radius-control); background: var(--indigo-soft);
  }
  .chosen div { display: grid; }
  .newcustomer { display: grid; gap: 0.75rem; }
  .matches { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-control); overflow: hidden; }
  .matches li + li { border-top: 1px solid var(--line); }
  .matches button {
    width: 100%; min-height: var(--tap); padding: 0.5rem 0.75rem; border: 0; background: var(--paper);
    display: flex; justify-content: space-between; gap: 0.5rem; text-align: left; cursor: pointer;
  }
  .matches button:hover { background: var(--indigo-soft); }
  .create { color: var(--indigo); justify-content: flex-start !important; }
  .link { justify-self: start; border: 0; background: none; color: var(--indigo); text-decoration: underline; cursor: pointer; padding: 0; }
  .small { font-size: 0.85rem; }
</style>
