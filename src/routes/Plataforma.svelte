<script>
  // El Sastre itself: every shop on the platform with its usage, and a form to add a new shop.
  // The platform never sees tickets or customers, only counts; the database enforces that.
  import { listShops, platformShopStats, adminUsers } from '../lib/api.js';
  import { formatTimestampDate, formatCount, countNoun, relativeDays } from '../lib/format.js';

  let shops = $state([]);
  let stats = $state({});
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let busy = $state(false);

  const emptyShop = () => ({ name: '', city: '', slug: '', admin_full_name: '', admin_username: '', admin_password: '' });
  let draft = $state(emptyShop());
  let slugTouched = $state(false);
  let createError = $state('');

  const activeCount = $derived(shops.filter((s) => s.active).length);
  const ticketsThisMonth = $derived(Object.values(stats).reduce((sum, row) => sum + (Number(row.tickets_this_month) || 0), 0));

  /** 'Sastrería El Botón' → 'el-boton'. */
  function slugify(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/^sastreria\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  }
  $effect(() => { if (!slugTouched) draft.slug = slugify(draft.name); });

  async function load() {
    error = '';
    try {
      const [shopRows, statRows] = await Promise.all([listShops(), platformShopStats()]);
      shops = shopRows;
      stats = Object.fromEntries(statRows.map((row) => [row.shop_id, row]));
    } catch (e) { error = e.message; } finally { loading = false; }
  }
  function retry() { loading = true; load(); }
  load();

  async function create(event) {
    event.preventDefault();
    createError = '';
    notice = '';
    busy = true;
    try {
      await adminUsers('create_shop', { ...draft, admin_username: draft.admin_username.trim().toLowerCase() });
      notice = `${draft.name} creada. Su administrador entra con el usuario ${draft.admin_username.trim().toLowerCase()}; comparte la contraseña en persona.`;
      draft = emptyShop();
      slugTouched = false;
      await load();
    } catch (e) {
      createError = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="page page-wide plataforma">
  <h1>Sastrerías</h1>
  <p class="muted">Cada sastrería ve solo sus propios arreglos, clientes y usuarios. Aquí ves cuánto la usan, nunca sus datos.</p>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  <div class="cols">
    <section class="list" aria-labelledby="h-shops" aria-busy={loading}>
      <h2 id="h-shops" class="visually-hidden">Lista de sastrerías</h2>
      {#if error}
        <div class="warning retry" role="alert">
          <span>No se pudo cargar la lista: {error}</span>
          <button class="btn" onclick={retry}>Reintentar</button>
        </div>
      {:else if loading}
        <div class="totals" aria-hidden="true"><span class="loading-row skel"></span><span class="loading-row skel"></span></div>
        <ul aria-hidden="true">
          {#each [1, 2, 3] as i (i)}<li class="loading-row skel-row"></li>{/each}
        </ul>
      {:else if shops.length === 0}
        <p class="empty">No hay sastrerías todavía. Crea la primera con el formulario.</p>
      {:else}
        <dl class="totals">
          <div><dt>Sastrerías</dt><dd><b class="narrow num">{formatCount(activeCount)} {activeCount === 1 ? 'activa' : 'activas'}</b>
            <span>de {formatCount(shops.length)} en total</span></dd></div>
          <div><dt>Arreglos este mes</dt><dd><b class="narrow num">{formatCount(ticketsThisMonth)}</b>
            <span>en todas las sastrerías</span></dd></div>
        </dl>
        <ul>
          {#each shops as shop (shop.id)}
            {@const row = stats[shop.id] ?? {}}
            <li>
              <a class="shop" class:off={!shop.active} href={`#/plataforma/${shop.id}`}>
                <span class="head">
                  <span class="name"><b>{shop.name}</b>
                    <span class="muted">{shop.city ? `${shop.city}, ` : ''}creada el {formatTimestampDate(shop.created_at)}</span></span>
                  <span class="badge" class:badge-off={!shop.active}>{shop.active ? 'Activa' : 'Desactivada'}</span>
                </span>
                <span class="facts">
                  <span><b class="num">{countNoun(row.tailors_active ?? 0, 'sastre activo', 'sastres activos')}</b>,
                    {formatCount(row.users_active ?? 0)} de {countNoun(row.users_total ?? 0, 'usuario', 'usuarios')} activos</span>
                  <span><b class="num">{countNoun(row.tickets_this_month ?? 0, 'arreglo', 'arreglos')}</b> este mes</span>
                  <span>Última actividad: <b>{relativeDays(row.last_activity_at)}</b></span>
                </span>
                <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel create" aria-labelledby="h-new">
      <h2 id="h-new">Nueva sastrería</h2>
      <form onsubmit={create}>
        <label class="field"><span>Nombre</span>
          <input class="input" bind:value={draft.name} placeholder="Sastrería El Botón" required /></label>
        <label class="field"><span>Ciudad (opcional)</span>
          <input class="input" bind:value={draft.city} placeholder="Medellín" /></label>
        <label class="field"><span>Código</span>
          <input class="input" bind:value={draft.slug} oninput={() => (slugTouched = true)} required
                 pattern="[a-z0-9-]{'{'}3,30{'}'}" />
          <small class="muted">Minúsculas, números y guiones. Identifica la sastrería; no se cambia después.</small></label>
        <h3>Su primer administrador</h3>
        <label class="field"><span>Nombre completo</span>
          <input class="input" bind:value={draft.admin_full_name} required /></label>
        <label class="field"><span>Usuario</span>
          <input class="input" bind:value={draft.admin_username} autocapitalize="none" required />
          <small class="muted">Único en toda la plataforma. Por ejemplo, admin_boton.</small></label>
        <label class="field"><span>Contraseña inicial</span>
          <input class="input" type="password" bind:value={draft.admin_password} autocomplete="new-password" required minlength="8" /></label>
        {#if createError}<p class="error" role="alert">{createError}</p>{/if}
        <button class="btn btn-indigo btn-block" type="submit" disabled={busy}>Crear sastrería</button>
      </form>
    </section>
  </div>
</main>

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; }
  .list { flex: 999 1 420px; min-width: 0; display: grid; gap: 0.75rem; container-type: inline-size; }
  .create { flex: 1 1 320px; min-width: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
  .totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin: 0; }
  .totals > div { background: var(--indigo); color: #fff; border-radius: var(--radius-tag); padding: 0.85rem 1rem; min-width: 0; }
  .totals dt { color: var(--pano-text); font-size: 0.875rem; font-weight: 600; }
  .totals dd { margin: 0; display: grid; }
  .totals dd b { font-size: 1.6rem; line-height: 1.15; }
  .totals dd span { color: var(--pano-text); font-size: 0.875rem; }
  .skel { display: block; height: 96px; border-radius: var(--radius-tag); }
  .skel-row { height: 132px; border-radius: 18px; }
  .shop {
    position: relative; display: grid; gap: 0.6rem; padding: 1rem 2.6rem 1rem 1.1rem; min-height: 54px;
    background: var(--paper); border: 1px solid var(--line); border-radius: 18px; color: var(--ink); text-decoration: none;
    transition: border-color var(--fast);
  }
  .shop:hover { border-color: var(--indigo); }
  .shop.off { background: var(--chalk); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem 0.75rem; flex-wrap: wrap; }
  .name { display: grid; min-width: 0; }
  .name b { font-size: 1.125rem; }
  .name .muted { font-size: 0.9375rem; }
  .badge { font-size: 0.8125rem; font-weight: 700; padding: 0.2rem 0.65rem; border-radius: 999px;
    background: var(--ready-soft); color: var(--ready); border: 1px solid #cfe0d5; white-space: nowrap; }
  .badge-off { background: var(--overdue-soft); color: var(--overdue); border-color: #efb7b1; }
  .facts { display: grid; gap: 0.2rem; font-size: 0.9375rem; color: var(--muted); }
  .facts b { color: var(--ink); }
  .chev { position: absolute; right: 0.9rem; top: 50%; width: 20px; height: 20px; margin-top: -10px;
    fill: none; stroke: var(--muted); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  @container (min-width: 720px) {
    .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
  }
  .empty { background: var(--paper); border: 1px dashed var(--line); border-radius: 18px; padding: 1.25rem; text-align: center; }
  .retry { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  form { display: grid; gap: 0.85rem; }
  h3 { font-size: 1rem; margin-top: 0.4rem; }
  small { font-size: 0.8125rem; }
  .notice { background: var(--ready-soft); color: var(--ready); border-radius: 12px; padding: 0.7rem 1rem; font-weight: 600; }
</style>
