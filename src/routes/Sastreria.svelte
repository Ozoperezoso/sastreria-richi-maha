<script>
  // One shop's page for the platform. Placeholder: shows the name until the full page lands.
  import { getShop } from '../lib/api.js';

  let { params } = $props();
  let shop = $state(null);
  let error = $state('');

  async function load() {
    try {
      shop = await getShop(params.id);
    } catch (e) { error = e.message; }
  }
  load();
</script>

<main class="page page-wide">
  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !shop}
    <p class="muted">Cargando…</p>
  {:else}
    <h1>{shop.name}</h1>
  {/if}
</main>
