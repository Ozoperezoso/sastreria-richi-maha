<script>
  import { session, signIn } from '../lib/session.svelte.js';
  import { APP_NAME } from '../lib/shop.js';

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
    <div class="brand-text">
      <p class="shop">Para sastrerías</p>
      <h1 class="narrow">{APP_NAME}</h1>
      <p class="hint">Entra con el usuario que te dio el administrador de tu sastrería.</p>
    </div>
    <hr class="seam ruler" aria-hidden="true" />
  </div>

  <div class="side">
    <form class="form" onsubmit={submit}>
      <h2>Entrar</h2>
      <label class="field">
        <span>Usuario</span>
        <input class="input" name="username" autocomplete="username" autocapitalize="none" bind:value={username} required />
      </label>
      <label class="field">
        <span>Contraseña</span>
        <input class="input" name="password" type="password" autocomplete="current-password" bind:value={password} required />
      </label>
      {#if session.error}<p class="warning" role="alert">{session.error}</p>{/if}
      <button class="btn btn-indigo btn-block enter" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <p class="muted small">¿Olvidaste la contraseña? Pídele al administrador que la cambie. En el computador del taller, toca Salir antes de irte.</p>
    </form>
  </div>
</main>

<style>
  .login { min-height: 100dvh; display: flex; flex-wrap: wrap; }
  .brand {
    flex: 1 1 380px; min-width: 0; background: var(--indigo); color: #f5f4ef;
    display: flex; flex-direction: column; justify-content: space-between; gap: 2rem; padding: 2.5rem 1.75rem 0; overflow: hidden;
  }
  .brand-text { display: grid; gap: 0.6rem; max-width: 420px; }
  .shop { font-size: 0.9375rem; font-weight: 600; color: var(--pano-text); }
  h1 { font-size: 4.5rem; line-height: 0.95; }
  .hint { font-size: 1.0625rem; color: var(--pano-text); }
  .ruler { height: 56px; margin: 0 -1.75rem; border-radius: 0;
    background:
      repeating-linear-gradient(90deg, var(--tape-ink) 0 1.5px, transparent 1.5px 10px) left top / 100% 14px no-repeat,
      repeating-linear-gradient(90deg, var(--tape-ink) 0 2px, transparent 2px 50px) left top / 100% 26px no-repeat,
      var(--thread); }
  .side { flex: 1 1 380px; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 2.5rem 1.5rem; }
  .form { width: 100%; max-width: 380px; display: grid; gap: 1.1rem; }
  .form h2 { font-size: 1.75rem; }
  .enter { min-height: 54px; border-radius: 14px; font-size: 1.0625rem; }
  .small { font-size: 0.875rem; }
</style>
