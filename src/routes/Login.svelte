<script>
  import { session, signIn } from '../lib/session.svelte.js';

  let username = $state('');
  let password = $state('');
  let busy = $state(false);

  async function submit(event) {
    event.preventDefault();
    busy = true;
    await signIn(username, password);
    busy = false;
  }
</script>

<main class="login">
  <div class="brand">
    <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="23" r="3.5"/><circle cx="22" cy="23" r="3.5"/><path d="M12.4 20.4 23 6M19.6 20.4 9 6"/></svg>
    <h1>Sastrería Richi-Maha</h1>
  </div>
  <hr class="seam" />

  <form class="panel" onsubmit={submit}>
    <label class="field">
      <span>Usuario</span>
      <input class="input" name="username" autocomplete="username" autocapitalize="none" bind:value={username} required />
    </label>
    <label class="field">
      <span>Contraseña</span>
      <input class="input" name="password" type="password" autocomplete="current-password" bind:value={password} required />
    </label>
    {#if session.error}<p class="error" role="alert">{session.error}</p>{/if}
    <button class="btn btn-indigo btn-block" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
  </form>
</main>

<style>
  .login { max-width: 400px; margin: 0 auto; padding: 18vh 1rem 2rem; display: grid; gap: 1.25rem; }
  .brand { display: flex; align-items: center; gap: 0.75rem; color: var(--indigo); }
  .brand svg { width: 2.5rem; height: 2.5rem; fill: none; stroke: var(--thread); stroke-width: 2.4; stroke-linecap: round;
    background: var(--indigo); border-radius: 9px; padding: 4px; }
  .brand h1 { font-size: 1.35rem; }
</style>
