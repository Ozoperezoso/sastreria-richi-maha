<script>
  // El Sastre itself: the shops on the platform, their administrators, and a form to add a new shop.
  // The platform never sees tickets or customers; the database enforces that.
  import Modal from '../components/Modal.svelte';
  import { listShops, listProfiles, adminUsers } from '../lib/api.js';

  let shops = $state([]);
  let users = $state([]);
  let error = $state('');
  let notice = $state('');
  let busy = $state(false);

  const emptyShop = () => ({ name: '', city: '', slug: '', admin_full_name: '', admin_username: '', admin_password: '' });
  let draft = $state(emptyShop());
  let slugTouched = $state(false);
  let createError = $state('');

  let confirmShop = $state(null);
  let confirmOpen = $state(false);
  let resetFor = $state(null);
  let resetOpen = $state(false);
  let newPassword = $state('');
  let resetError = $state('');

  const usersOf = (shopId) => users.filter((u) => u.shop_id === shopId);
  const adminsOf = (shopId) => usersOf(shopId).filter((u) => u.role === 'admin');

  /** 'Sastrería El Botón' → 'el-boton'. */
  function slugify(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/^sastreria\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  }
  $effect(() => { if (!slugTouched) draft.slug = slugify(draft.name); });

  async function load() {
    try {
      [shops, users] = await Promise.all([listShops(), listProfiles()]);
    } catch (e) { error = e.message; }
  }
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

  function askToggle(shop) { confirmShop = shop; confirmOpen = true; }
  async function toggle() {
    busy = true;
    try {
      await adminUsers('set_shop_active', { shop_id: confirmShop.id, active: !confirmShop.active });
      notice = `${confirmShop.name} ${confirmShop.active ? 'desactivada' : 'activada'}.`;
      confirmOpen = false;
      await load();
    } catch (e) { error = e.message; } finally { busy = false; }
  }

  function askReset(user) { resetFor = user; newPassword = ''; resetError = ''; resetOpen = true; }
  async function reset(event) {
    event.preventDefault();
    busy = true;
    try {
      await adminUsers('reset_password', { user_id: resetFor.id, password: newPassword });
      notice = `Contraseña de ${resetFor.username} cambiada.`;
      resetOpen = false;
    } catch (e) { resetError = e.message; } finally { busy = false; }
  }
</script>

<main class="page page-wide plataforma">
  <h1>Sastrerías</h1>
  <p class="muted">Desde aquí agregas sastrerías a El Sastre. Cada una ve solo sus propios arreglos, clientes y usuarios; la plataforma no ve los datos de ninguna.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  <div class="cols">
    <section class="list" aria-labelledby="h-shops">
      <h2 id="h-shops">{shops.length} {shops.length === 1 ? 'sastrería' : 'sastrerías'}</h2>
      <ul>
        {#each shops as shop (shop.id)}
          <li class:off={!shop.active}>
            <div class="row">
              <div class="name">
                <b>{shop.name}</b>
                <span class="muted">{shop.city ? `${shop.city}, ` : ''}código {shop.slug}{shop.active ? '' : ', desactivada'}</span>
              </div>
              <button class="btn" class:btn-danger={shop.active} onclick={() => askToggle(shop)}>
                {shop.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
            <p class="meta muted">
              {usersOf(shop.id).length} {usersOf(shop.id).length === 1 ? 'usuario' : 'usuarios'}.
              Próximo arreglo: N° {shop.next_ticket_number}.
            </p>
            {#each adminsOf(shop.id) as user (user.id)}
              <div class="admin">
                <span>Administrador: <b>{user.full_name}</b> ({user.username}){user.active ? '' : ', inactivo'}</span>
                <button class="btn small" onclick={() => askReset(user)}>Cambiar contraseña</button>
              </div>
            {/each}
          </li>
        {/each}
      </ul>
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

<Modal bind:open={confirmOpen} title={confirmShop?.active ? `¿Desactivar ${confirmShop?.name}?` : `¿Activar ${confirmShop?.name}?`}>
  <p>{confirmShop?.active
    ? 'Nadie de esta sastrería podrá entrar ni ver sus datos hasta que la actives otra vez. Los datos no se borran.'
    : 'Sus usuarios activos podrán entrar otra vez.'}</p>
  <div class="actions">
    <button class="btn" onclick={() => (confirmOpen = false)}>Cancelar</button>
    <button class="btn" class:btn-danger={confirmShop?.active} class:btn-indigo={!confirmShop?.active} disabled={busy} onclick={toggle}>
      {confirmShop?.active ? 'Desactivar' : 'Activar'}
    </button>
  </div>
</Modal>

<Modal bind:open={resetOpen} title={`Nueva contraseña para ${resetFor?.username ?? ''}`}>
  <form onsubmit={reset}>
    <label class="field"><span>Contraseña nueva</span>
      <input class="input" type="password" bind:value={newPassword} autocomplete="new-password" required minlength="8" /></label>
    {#if resetError}<p class="error" role="alert">{resetError}</p>{/if}
    <div class="actions">
      <button type="button" class="btn" onclick={() => (resetOpen = false)}>Cancelar</button>
      <button class="btn btn-indigo" type="submit" disabled={busy}>Guardar contraseña</button>
    </div>
  </form>
</Modal>

<style>
  .cols { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; }
  .list { flex: 999 1 420px; min-width: 0; }
  .create { flex: 1 1 320px; min-width: 0; }
  .list h2 { margin-bottom: 0.6rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
  li { background: var(--paper); border: 1px solid var(--line); border-radius: 18px; padding: 1rem 1.1rem; display: grid; gap: 0.5rem; }
  li.off { background: #f4f6f5; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .name { display: grid; min-width: 0; }
  .name b { font-size: 1.125rem; }
  .meta { font-size: 0.9375rem; }
  .admin { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;
    padding-top: 0.5rem; border-top: 1px solid var(--line-soft); font-size: 0.9375rem; }
  .small { min-height: 40px; font-size: 0.875rem; }
  form { display: grid; gap: 0.85rem; }
  h3 { font-size: 1rem; margin-top: 0.4rem; }
  small { font-size: 0.8125rem; }
  .notice { background: var(--ready-soft); color: var(--ready); border-radius: 12px; padding: 0.7rem 1rem; font-weight: 600; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
</style>
