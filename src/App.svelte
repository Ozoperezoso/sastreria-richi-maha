<script>
  import { onMount } from 'svelte';
  import { session, initSession, recheck, signOut } from './lib/session.svelte.js';
  import { router, startRouter, navigate } from './lib/router.svelte.js';
  import { isAdmin, isPlatform } from './lib/permissions.js';
  import { APP_NAME, shopLabel } from './lib/shop.js';
  import Plataforma from './routes/Plataforma.svelte';
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

  const Screen = $derived(SCREENS[router.name] ?? Inicio);
  const admin = $derived(isAdmin(session.profile));
</script>

{#if session.loading}
  <p class="loading muted">Cargando…</p>
{:else if !session.profile}
  <Login />
{:else}
  <header class="topbar">
    <div class="bar">
      <a class="shop" href="#/"><span class="app narrow">{APP_NAME}</span> <span class="place">{shopLabel(session.profile)}</span></a>
      <span class="who" title={session.profile.full_name}>{session.profile.full_name.split(' ')[0]}</span>
      <button class="logout" onclick={signOut}>Salir</button>
    </div>
  </header>
  {#if isPlatform(session.profile)}
    <Plataforma />
  {:else}
  {#if admin}
    <nav class="adminnav" aria-label="Administración">
      <a href="#/admin" aria-current={router.name === 'panel' ? 'page' : undefined}>Panel</a>
      <a href="#/admin/todos" aria-current={router.name === 'todos' ? 'page' : undefined}>Todos los arreglos</a>
      <a href="#/admin/usuarios" aria-current={router.name === 'usuarios' ? 'page' : undefined}>Usuarios</a>
      <a href="#/" aria-current={router.name === 'inicio' ? 'page' : undefined}>Pendientes</a>
    </nav>
  {/if}
  {#if !router.admin || admin}
    {#key router.path}<Screen params={router.params} />{/key}
  {/if}
  {/if}
{/if}

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
  .adminnav { display: flex; gap: 0.25rem; overflow-x: auto; padding: 0.5rem 1rem; background: var(--paper);
    border-bottom: 1px solid var(--line); scrollbar-width: none; justify-content: safe center; }
  .adminnav::-webkit-scrollbar { display: none; }
  .adminnav a {
    white-space: nowrap; min-height: 40px; display: inline-flex; align-items: center; padding: 0 0.9rem; border-radius: 999px;
    text-decoration: none; color: var(--muted); font-weight: 650; font-size: 0.9375rem;
  }
  .adminnav a:hover { color: var(--indigo); }
  .adminnav a[aria-current='page'] { background: var(--indigo); color: #fff; }
</style>
