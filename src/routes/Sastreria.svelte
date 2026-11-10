<script>
  // One shop's page for the platform: who it is, how much it is used, who to call, and its users.
  // Only counts come back from the database; customer and ticket data never reach this screen.
  import Modal from '../components/Modal.svelte';
  import MonthBars from '../components/MonthBars.svelte';
  import { getShop, getShopContact, platformShopStats, platformShopUsers, adminUsers } from '../lib/api.js';
  import { formatDate, formatCount, relativeDays } from '../lib/format.js';
  import { notify } from '../lib/toast.svelte.js';

  let { params } = $props();

  let shop = $state(null);
  let contact = $state(null);
  let stats = $state(null);
  let users = $state([]);
  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);

  // One dialog at a time: which one, who it is about, its form and its error.
  let dialog = $state('');
  let dialogOpen = $state(false);
  let target = $state(null);
  let form = $state({});
  let formError = $state('');

  const ROLE = { admin: 'Administrador', tailor: 'Sastre' };
  const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
  const plural = (n, one, many) => `${formatCount(n)} ${Number(n) === 1 ? one : many}`;

  async function load() {
    const id = params.id;
    error = '';
    try {
      const [shopRow, contactRow, statRows, userRows] = await Promise.all([
        getShop(id), getShopContact(id), platformShopStats(), platformShopUsers(id),
      ]);
      shop = shopRow;
      contact = contactRow;
      stats = statRows.find((row) => row.shop_id === id) ?? null;
      users = [...userRows].sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name, 'es'));
    } catch (e) { error = e.message; } finally { loading = false; }
  }
  function retry() { loading = true; load(); }
  load();

  function open(kind, about = null, values = {}) {
    dialog = kind;
    target = about;
    form = values;
    formError = '';
    dialogOpen = true;
  }

  /** Runs a dialog's action; on success closes it, tells the person and reloads. */
  async function run(action, payload, done) {
    busy = true;
    formError = '';
    try {
      await adminUsers(action, payload);
      dialogOpen = false;
      notify(done);
      await load();
    } catch (e) {
      formError = e.message;
    } finally {
      busy = false;
    }
  }

  const openEdit = () => open('edit', null, {
    name: shop.name ?? '', city: shop.city ?? '',
    contact_name: contact?.contact_name ?? '', contact_phone: contact?.contact_phone ?? '',
    contact_email: contact?.contact_email ?? '', notes: contact?.notes ?? '',
  });
  // update_shop replaces every field, so the whole form always goes.
  function saveEdit(event) {
    event.preventDefault();
    run('update_shop', { shop_id: shop.id, ...form }, 'Cambios guardados.');
  }

  function toggleShop() {
    run('set_shop_active', { shop_id: shop.id, active: !shop.active },
      `${shop.name} ${shop.active ? 'desactivada' : 'activada'}.`);
  }

  function saveNewUser(event) {
    event.preventDefault();
    const username = form.username.trim().toLowerCase();
    run('create', { ...form, username, shop_id: shop.id }, `Usuario ${username} creado. Comparte la contraseña en persona.`);
  }

  function saveRename(event) {
    event.preventDefault();
    run('rename_user', { user_id: target.id, full_name: form.full_name }, `Nombre de ${target.username} cambiado.`);
  }

  function saveReset(event) {
    event.preventDefault();
    run('reset_password', { user_id: target.id, password: form.password }, `Contraseña de ${target.username} cambiada.`);
  }

  function toggleUser() {
    run('set_active', { user_id: target.id, active: !target.active },
      `${target.full_name} ${target.active ? 'desactivado' : 'activado'}.`);
  }

  const title = $derived({
    edit: 'Editar sastrería',
    shop: shop?.active ? `¿Desactivar ${shop?.name}?` : `¿Activar ${shop?.name}?`,
    new: 'Nuevo usuario',
    rename: `Cambiar nombre de ${target?.username ?? ''}`,
    reset: `Nueva contraseña para ${target?.username ?? ''}`,
    user: target?.active ? `¿Desactivar a ${target?.full_name}?` : `¿Activar a ${target?.full_name}?`,
  }[dialog] ?? '');
</script>

<main class="page page-wide sastreria" aria-busy={loading}>
  <a class="back" href="#/">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Sastrerías</a>

  {#if error}
    <div class="warning retry" role="alert">
      <span>No se pudo cargar la sastrería: {error}</span>
      <button class="btn" onclick={retry}>Reintentar</button>
    </div>
  {:else if loading}
    <div class="skeleton" aria-hidden="true">
      <span class="loading-row sk-title"></span>
      <span class="loading-row sk-block"></span>
      <span class="loading-row sk-block"></span>
    </div>
    <p class="visually-hidden" role="status">Cargando…</p>
  {:else}
    <header class="head">
      <div class="who">
        <h1>{shop.name}</h1>
        <p class="muted">{shop.city ? `${shop.city}, ` : ''}código <b>{shop.slug}</b>, creada el {formatDate(shop.created_at)}</p>
        <span class="badge" class:badge-off={!shop.active}>{shop.active ? 'Activa' : 'Desactivada'}</span>
      </div>
      <div class="buttons">
        <button class="btn" onclick={openEdit}>Editar</button>
        <button class="btn" class:btn-danger={shop.active} onclick={() => open('shop')}>
          {shop.active ? 'Desactivar' : 'Activar'}</button>
      </div>
    </header>

    <div class="grid">
      <section class="panel" aria-labelledby="h-uso">
        <h2 id="h-uso">Uso</h2>
        <dl class="tiles">
          <div><dt>Arreglos este mes</dt><dd class="narrow num">{formatCount(stats?.tickets_this_month ?? 0)}</dd></div>
          <div><dt>Arreglos en total</dt><dd class="narrow num">{formatCount(stats?.tickets_total ?? 0)}</dd></div>
          <div><dt>Sastres activos</dt><dd class="narrow num">{formatCount(stats?.tailors_active ?? 0)}</dd></div>
          <div><dt>Última actividad</dt>
            <dd class="text" title={stats?.last_activity_at ? formatDate(stats.last_activity_at) : undefined}>{relativeDays(stats?.last_activity_at)}</dd></div>
        </dl>
        <h3>Arreglos recibidos, últimos 6 meses</h3>
        <MonthBars months={stats?.months ?? []} />
      </section>

      <section class="panel" aria-labelledby="h-contacto">
        <h2 id="h-contacto">Contacto</h2>
        <dl class="contact">
          <div><dt>Persona de contacto</dt><dd>{#if contact?.contact_name}{contact.contact_name}{:else}<span class="muted">Sin dato</span>{/if}</dd></div>
          <div><dt>Teléfono</dt><dd>{#if contact?.contact_phone}<a class="tel" href={telHref(contact.contact_phone)}>{contact.contact_phone}</a>{:else}<span class="muted">Sin dato</span>{/if}</dd></div>
          <div><dt>Correo</dt><dd>{#if contact?.contact_email}<a href={`mailto:${contact.contact_email}`}>{contact.contact_email}</a>{:else}<span class="muted">Sin dato</span>{/if}</dd></div>
          <div><dt>Notas</dt><dd class="notes">{#if contact?.notes}{contact.notes}{:else}<span class="muted">Sin dato</span>{/if}</dd></div>
        </dl>
      </section>
    </div>

    <section class="panel" aria-labelledby="h-usuarios">
      <div class="section-head">
        <h2 id="h-usuarios">Usuarios <span class="muted count">{plural(users.length, 'usuario', 'usuarios')}</span></h2>
        <button class="btn btn-indigo" onclick={() => open('new', null, { username: '', full_name: '', role: 'tailor', password: '' })}>Nuevo usuario</button>
      </div>
      {#if users.length === 0}
        <p class="muted">Esta sastrería no tiene usuarios.</p>
      {:else}
        <ul class="users">
          {#each users as user (user.id)}
            <li class:inactive={!user.active}>
              <div class="info">
                <strong>{user.full_name}</strong>
                <span class="muted">{user.username}, {ROLE[user.role] ?? user.role}, {user.active ? 'activo' : 'Inactivo'}</span>
                <span class="muted">{user.last_sign_in_at ? `Último ingreso: ${relativeDays(user.last_sign_in_at)}` : 'Nunca ha entrado'}</span>
              </div>
              <div class="buttons">
                <button class="btn" onclick={() => open('rename', user, { full_name: user.full_name })}>Cambiar nombre</button>
                <button class="btn" onclick={() => open('reset', user, { password: '' })}>Cambiar contraseña</button>
                <button class="btn" class:btn-danger={user.active} onclick={() => open('user', user)}>
                  {user.active ? 'Desactivar' : 'Activar'}</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<Modal bind:open={dialogOpen} {title}>
  {#if dialog === 'edit'}
    <form class="stack" onsubmit={saveEdit}>
      <label class="field"><span>Nombre</span>
        <input class="input" bind:value={form.name} required /></label>
      <label class="field"><span>Ciudad</span>
        <input class="input" bind:value={form.city} /></label>
      <p class="muted small">Código <b>{shop?.slug}</b>. No se puede cambiar.</p>
      <label class="field"><span>Persona de contacto</span>
        <input class="input" bind:value={form.contact_name} autocomplete="off" /></label>
      <label class="field"><span>Teléfono</span>
        <input class="input" type="tel" inputmode="tel" bind:value={form.contact_phone} autocomplete="off" /></label>
      <label class="field"><span>Correo</span>
        <input class="input" inputmode="email" autocapitalize="none" bind:value={form.contact_email} autocomplete="off" /></label>
      <label class="field"><span>Notas</span>
        <textarea class="input" bind:value={form.notes} rows="3"></textarea></label>
      {#if formError}<p class="error" role="alert">{formError}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" onclick={() => (dialogOpen = false)}>Cancelar</button>
        <button class="btn btn-indigo" type="submit" disabled={busy}>Guardar</button>
      </div>
    </form>
  {:else if dialog === 'shop'}
    {#if shop?.active}
      <p>Sus usuarios pierden el acceso de inmediato y nadie podrá entrar ni ver sus datos hasta que la actives otra vez. Los datos no se borran.</p>
      <p class="warning note">Si quieren guardar sus datos, su administrador debe exportar el CSV antes.</p>
    {:else}
      <p>Sus usuarios activos podrán entrar otra vez.</p>
    {/if}
    {#if formError}<p class="error" role="alert">{formError}</p>{/if}
    <div class="actions">
      <button class="btn" onclick={() => (dialogOpen = false)}>Cancelar</button>
      <button class="btn" class:btn-danger={shop?.active} class:btn-indigo={!shop?.active} disabled={busy} onclick={toggleShop}>
        {shop?.active ? 'Desactivar' : 'Activar'}</button>
    </div>
  {:else if dialog === 'new'}
    <form class="stack" onsubmit={saveNewUser}>
      <label class="field"><span>Usuario</span>
        <input class="input" bind:value={form.username} autocapitalize="none" autocomplete="off" required
          pattern="[a-z0-9_]{'{'}3,20{'}'}" title="3 a 20 letras minúsculas, números o _" /></label>
      <label class="field"><span>Nombre completo</span>
        <input class="input" bind:value={form.full_name} autocomplete="off" required /></label>
      <label class="field"><span>Rol</span>
        <select class="input" bind:value={form.role}>
          <option value="tailor">Sastre</option>
          <option value="admin">Administrador</option>
        </select></label>
      <label class="field"><span>Contraseña inicial</span>
        <input class="input" type="text" bind:value={form.password} autocomplete="new-password" minlength="8" required /></label>
      <p class="muted small">Mínimo 8 caracteres. Compártela en persona.</p>
      {#if formError}<p class="error" role="alert">{formError}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" onclick={() => (dialogOpen = false)}>Cancelar</button>
        <button class="btn btn-indigo" type="submit" disabled={busy}>Crear usuario</button>
      </div>
    </form>
  {:else if dialog === 'rename'}
    <form class="stack" onsubmit={saveRename}>
      <label class="field"><span>Nombre completo</span>
        <input class="input" bind:value={form.full_name} autocomplete="off" required /></label>
      <p class="muted small">El usuario <b>{target?.username}</b> no cambia.</p>
      {#if formError}<p class="error" role="alert">{formError}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" onclick={() => (dialogOpen = false)}>Cancelar</button>
        <button class="btn btn-indigo" type="submit" disabled={busy}>Guardar nombre</button>
      </div>
    </form>
  {:else if dialog === 'reset'}
    <form class="stack" onsubmit={saveReset}>
      <label class="field"><span>Contraseña nueva</span>
        <input class="input" type="text" bind:value={form.password} autocomplete="new-password" minlength="8" required /></label>
      <p class="muted small">Mínimo 8 caracteres. Compártela en persona.</p>
      {#if formError}<p class="error" role="alert">{formError}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" onclick={() => (dialogOpen = false)}>Cancelar</button>
        <button class="btn btn-indigo" type="submit" disabled={busy}>Guardar contraseña</button>
      </div>
    </form>
  {:else if dialog === 'user'}
    <p>{target?.active ? 'No podrá entrar, pero sus arreglos se conservan.' : 'Podrá entrar otra vez con su contraseña.'}</p>
    {#if formError}<p class="error" role="alert">{formError}</p>{/if}
    <div class="actions">
      <button class="btn" onclick={() => (dialogOpen = false)}>Cancelar</button>
      <button class="btn" class:btn-danger={target?.active} class:btn-indigo={!target?.active} disabled={busy} onclick={toggleUser}>
        {target?.active ? 'Desactivar' : 'Activar'}</button>
    </div>
  {/if}
</Modal>

<style>
  .sastreria { container-type: inline-size; }
  .back { display: inline-flex; align-items: center; gap: 0.25rem; min-height: var(--tap); width: fit-content;
    font-weight: 650; text-decoration: none; padding-right: 0.5rem; }
  .back svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 0.75rem 1rem; }
  .who { display: grid; gap: 0.35rem; justify-items: start; min-width: 0; }
  .buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .badge { font-size: 0.8125rem; font-weight: 700; padding: 0.2rem 0.65rem; border-radius: 999px;
    background: var(--ready-soft); color: var(--ready); border: 1px solid #cfe0d5; }
  .badge-off { background: var(--overdue-soft); color: var(--overdue); border-color: #efb7b1; }
  .grid { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
  h3 { font-size: 1rem; }
  dl { margin: 0; }
  dt { font-size: 0.875rem; font-weight: 600; color: var(--muted); }
  dd { margin: 0; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
  .tiles > div { background: var(--chalk); border-radius: var(--radius-control); padding: 0.7rem 0.85rem; min-width: 0; }
  .tiles dd { font-size: 1.75rem; line-height: 1.15; color: var(--indigo); }
  .tiles dd.text { font-size: 1.125rem; font-weight: 750; line-height: 1.6; }
  .contact { display: grid; gap: 0.75rem; }
  .contact dd { overflow-wrap: anywhere; }
  .notes { white-space: pre-wrap; }
  .tel { display: inline-flex; align-items: center; min-height: var(--tap); font-weight: 700; font-size: 1.125rem; }
  .section-head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .count { font-size: 0.9375rem; font-weight: 600; margin-left: 0.25rem; }
  .users { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .users li { display: grid; gap: 0.6rem; padding: 0.85rem 1rem; background: var(--paper);
    border: 1px solid var(--line); border-radius: var(--radius-tag); }
  .users li.inactive { background: var(--chalk); }
  .users li.inactive strong { color: var(--muted); }
  .info { display: grid; min-width: 0; }
  .retry { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .skeleton { display: grid; gap: 1rem; }
  .sk-title { display: block; height: 72px; border-radius: var(--radius-control); }
  .sk-block { display: block; height: 220px; border-radius: var(--radius-tag); }
  .stack { display: grid; gap: 0.85rem; }
  .small { font-size: 0.85rem; }
  .note { margin-top: 0.75rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
  .stack .actions { margin-top: 0.25rem; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  @container (min-width: 720px) {
    .grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
    .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .users li { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  }
</style>
