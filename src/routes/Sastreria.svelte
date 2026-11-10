<script>
  // One shop's page for the platform. Placeholder: shows the name until the full page lands.
  import { getShop } from '../lib/api.js';

  let { params } = $props();
  let shop = $state(null);
  let error = $state('');

  getShop(params.id).then((row) => { shop = row; }).catch((e) => { error = e.message; });
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
