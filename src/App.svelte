<script>
  import { onMount } from 'svelte';
  import { session, initSession, recheck, signOut } from './lib/session.svelte.js';
  import { router, startRouter, navigate } from './lib/router.svelte.js';
  import { isAdmin, isPlatform } from './lib/permissions.js';
  import { APP_NAME, shopLabel } from './lib/shop.js';
  import Plataforma from './routes/Plataforma.svelte';
  import Sastreria from './routes/Sastreria.svelte';
  import Toast from './components/Toast.svelte';
  import Login from './routes/Login.svelte';
  import Inicio from './routes/Inicio.svelte';
  import NuevoArreglo from './routes/NuevoArreglo.svelte';
  import Detalle from './routes/Detalle.svelte';
  import AdminPanel from './routes/AdminPanel.svelte';
  import AdminTodos from './routes/AdminTodos.svelte';
  import AdminUsuarios from './routes/AdminUsuarios.svelte';

  const SCREENS = {
    inicio: Inicio, nuevo: NuevoArreglo, detalle: Detalle,
    panel: AdminPanel, todos: AdminTodos, usuarios: AdminUsuarios,
  };

  onMount(() => {
    initSession();
    startRouter(() => { if (session.user) recheck(); });
    const onVisible = () => { if (document.visibilityState === 'visible' && session.user) recheck(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  // Admin screens are only for the admin; anyone else is sent to the list.
  $effect(() => {
    if (session.profile && router.admin && !isAdmin(session.profile)) navigate('/');
  });

  // Shop pages are only for the platform.
  $effect(() => {
    if (session.profile && router.platform && !isPlatform(session.profile)) navigate('/');
  });

  const Screen = $derived(SCREENS[router.name] ?? Inicio);
  const admin = $derived(isAdmin(session.profile));
  // The toast sits above the admin's bottom bar on phones.
  $effect(() => { document.body.classList.toggle('has-bottom-nav', admin && !isPlatform(session.profile)); });
</script>

{#if session.loading}
  <p class="loading muted">Cargando…</p>
{:else if !session.profile}
  <Login />
{:else}
  <header class="topbar">
    <div class="bar">
      <a class="shop" href="#/"><span class="app narrow">{APP_NAME}</span> <span class="place">{shopLabel(session.profile)}</span></a>
      {#if !isPlatform(session.profile)}<span class="who" title={session.profile.full_name}>{session.profile.full_name.split(' ')[0]}</span>{/if}
      <button class="logout" onclick={signOut}>Salir</button>
    </div>
  </header>
  {#if isPlatform(session.profile)}
    {#if router.name === 'plataforma'}
      {#key router.path}<Sastreria params={router.params} />{/key}
    {:else}
      <Plataforma />
    {/if}
  {:else}
  {#if admin}
    <nav class="adminnav" aria-label="Administración">
      <a href="#/admin" aria-current={router.name === 'panel' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>Panel</a>
      <a href="#/" aria-current={router.name === 'inicio' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h12"/></svg>Pendientes</a>
      <a href="#/admin/todos" aria-label="Todos los arreglos" aria-current={router.name === 'todos' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg><span class="long">Todos los arreglos</span><span class="short">Arreglos</span></a>
      <a href="#/admin/usuarios" aria-current={router.name === 'usuarios' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>Usuarios</a>
    </nav>
  {/if}
  {#if (!router.admin || admin) && !router.platform}
    {#key router.path}<Screen params={router.params} />{/key}
  {/if}
  {/if}
{/if}
<Toast />

<style>
  .loading { text-align: center; padding-top: 30vh; }
  .topbar { position: sticky; top: 0; z-index: 10; background: var(--paper); border-bottom: 1px solid var(--line); }
  .bar { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 0.75rem; padding: 0.55rem 1rem; }
  .shop { display: flex; align-items: baseline; gap: 0.4rem; margin-right: auto; min-height: var(--tap); align-content: center; flex-wrap: wrap;
    color: var(--indigo); text-decoration: none; white-space: nowrap; }
  .app { font-size: 1.4rem; line-height: var(--tap); }
  .place { font-size: 0.875rem; font-weight: 600; color: var(--muted); }
  .who { font-size: 0.9375rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .logout {
    min-height: 40px; padding: 0 0.9rem; border-radius: 999px; font-weight: 600; font-size: 0.875rem;
    border: 1.5px solid #c9d3ce; background: var(--paper); color: var(--ink); cursor: pointer;
  }
  .logout:hover { border-color: var(--indigo); }
  .adminnav { display: flex; gap: 0.25rem; padding: 0.5rem 1rem; background: var(--paper);
    border-bottom: 1px solid var(--line); justify-content: center; }
  .adminnav a {
    white-space: nowrap; min-height: 40px; display: inline-flex; align-items: center; gap: 0.4rem; padding: 0 0.9rem;
    border-radius: 999px; text-decoration: none; color: var(--muted); font-weight: 650; font-size: 0.9375rem;
    transition: background-color var(--fast), color var(--fast);
  }
  .adminnav svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .adminnav .short { display: none; }
  .adminnav a:hover { color: var(--indigo); }
  .adminnav a[aria-current='page'] { background: var(--indigo); color: #fff; }
  /* Teléfono: barra fija abajo, al alcance del pulgar, con las cuatro secciones siempre visibles. */
  @media (max-width: 720px) {
    .adminnav {
      position: fixed; z-index: 20; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 0; padding: 0.35rem 0.25rem calc(0.35rem + env(safe-area-inset-bottom));
      border-bottom: 0; border-top: 1px solid var(--line);
    }
    .adminnav a { flex-direction: column; justify-content: center; gap: 0.15rem; min-height: 56px; padding: 0 0.25rem;
      border-radius: 12px; font-size: 0.75rem; }
    .adminnav svg { width: 22px; height: 22px; }
    .adminnav .long { display: none; }
    .adminnav .short { display: inline; }
    .adminnav a[aria-current='page'] { background: var(--indigo-soft); color: var(--indigo); }
  }
</style>
