<script>
  import Modal from '../components/Modal.svelte';
  import { listProfiles, adminUsers } from '../lib/api.js';
  import { session } from '../lib/session.svelte.js';

  let { params } = $props();

  let users = $state([]);
  let error = $state('');
  let notice = $state('');
  let busy = $state(false);
  const emptyNew = () => ({ username: '', full_name: '', role: 'tailor', password: '' });
  let draft = $state(emptyNew());
  let createError = $state('');
  let resetFor = $state(null);
  let resetOpen = $state(false);
  let newPassword = $state('');
  let resetError = $state('');

  async function load() {
    try { users = await listProfiles(); } catch (e) { error = e.message; }
  }
  load();

  async function create(event) {
    event.preventDefault();
    createError = '';
    notice = '';
    busy = true;
    try {
      await adminUsers('create', { ...draft, username: draft.username.trim().toLowerCase() });
      notice = `Usuario ${draft.username.trim().toLowerCase()} creado. Comparte la contraseña en persona.`;
      draft = emptyNew();
      await load();
    } catch (e) {
      createError = e.message;
    } finally {
      busy = false;
    }
  }

  async function setActive(user, active) {
    const verb = active ? 'Activar' : 'Desactivar';
    if (!confirm(`¿${verb} a ${user.full_name}?${active ? '' : ' No podrá entrar, pero sus arreglos se conservan.'}`)) return;
    busy = true;
    error = '';
    try {
      await adminUsers('set_active', { user_id: user.id, active });
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  function openReset(user) {
    resetFor = user;
    newPassword = '';
    resetError = '';
    resetOpen = true;
  }
  async function saveReset() {
    busy = true;
    resetError = '';
    try {
      await adminUsers('reset_password', { user_id: resetFor.id, password: newPassword });
      notice = `Contraseña de ${resetFor.full_name} cambiada.`;
      resetOpen = false;
    } catch (e) {
      resetError = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="page page-wide">
  <h1>Usuarios</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  <ul class="users">
    {#each users as user (user.id)}
      <li class:inactive={!user.active}>
        <div class="info">
          <strong>{user.full_name}</strong>
          <span class="muted">{user.username}, {user.role === 'admin' ? 'administrador' : 'sastre'}{user.active ? '' : ', Inactivo'}</span>
        </div>
        <div class="buttons">
          <button class="btn" onclick={() => openReset(user)} disabled={busy}>Cambiar contraseña</button>
          {#if user.id !== session.profile.id}
            {#if user.active}
              <button class="btn btn-danger" onclick={() => setActive(user, false)} disabled={busy}>Desactivar</button>
            {:else}
              <button class="btn" onclick={() => setActive(user, true)} disabled={busy}>Activar</button>
            {/if}
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  <form class="panel" onsubmit={create}>
    <h2>Nuevo usuario</h2>
    <label class="field"><span>Usuario</span>
      <input class="input" bind:value={draft.username} autocapitalize="none" autocomplete="off" required
        pattern="[a-z0-9_]{'{'}3,20{'}'}" title="3 a 20 letras minúsculas, números o _" /></label>
    <label class="field"><span>Nombre completo</span>
      <input class="input" bind:value={draft.full_name} autocomplete="off" required /></label>
    <label class="field"><span>Rol</span>
      <select class="input" bind:value={draft.role}>
        <option value="tailor">Sastre</option>
        <option value="admin">Administrador</option>
      </select></label>
    <label class="field"><span>Contraseña inicial</span>
      <input class="input" type="text" bind:value={draft.password} autocomplete="new-password" minlength="8" required /></label>
    <p class="muted small">Mínimo 8 caracteres. Se la das a la persona en el taller.</p>
    {#if createError}<p class="error" role="alert">{createError}</p>{/if}
    <button class="btn btn-indigo" type="submit" disabled={busy}>Crear usuario</button>
  </form>
</main>

<Modal bind:open={resetOpen} title="Cambiar contraseña">
  <div class="stack">
    <p>Nueva contraseña para <strong>{resetFor?.full_name}</strong>.</p>
    <label class="field"><span>Nueva contraseña</span>
      <input class="input" type="text" bind:value={newPassword} autocomplete="new-password" /></label>
    {#if resetError}<p class="error">{resetError}</p>{/if}
  </div>
  <div class="modal-actions">
    <button class="btn btn-primary" onclick={saveReset} disabled={busy}>Guardar contraseña</button>
    <button class="btn" onclick={() => (resetOpen = false)}>Volver</button>
  </div>
</Modal>

<style>
  .users { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
  .users li {
    display: grid; gap: 0.6rem; padding: 0.85rem 1rem; background: var(--paper);
    border: 1px solid var(--line); border-radius: var(--radius-tag);
  }
  .users li.inactive { background: var(--chalk); }
  .users li.inactive strong { color: var(--muted); }
  .info { display: grid; }
  .buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .notice { background: var(--ready-soft); color: var(--ready); padding: 0.6rem 0.85rem; border-radius: var(--radius-control); font-weight: 600; }
  .small { font-size: 0.85rem; }
  .stack { display: grid; gap: 0.85rem; }
  .modal-actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem; }
</style>
