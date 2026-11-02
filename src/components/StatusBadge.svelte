<script>
  import { statusLabel } from '../lib/format.js';
  let { status } = $props();
</script>

<span class="badge {status}">{statusLabel(status)}</span>

<style>
  /* Estados con los colores del diseño: paño para lo que está en la mesa, verde estante para lo listo. */
  .badge {
    display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px;
    font-size: 0.8125rem; font-weight: 700; white-space: nowrap;
    background: #e9edeb; color: #3b4a44;
  }
  .en_proceso { background: var(--indigo-soft); color: var(--indigo); }
  .listo { background: var(--ready-soft); color: var(--ready); box-shadow: inset 0 0 0 1px #bfd9c8; }
  .entregado { background: #eceeed; color: var(--muted); }
  .cancelado { background: #eceeed; color: var(--muted); text-decoration: line-through; }
</style>
