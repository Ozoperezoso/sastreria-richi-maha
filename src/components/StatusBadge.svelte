<script>
  import { statusLabel } from '../lib/format.js';
  let { status } = $props();
</script>

<span class="badge {status}">{statusLabel(status)}</span>

<style>
  .badge {
    display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px;
    font-size: 0.8rem; font-weight: 650; white-space: nowrap;
    background: var(--indigo-soft); color: var(--indigo);
  }
  .en_proceso { background: #eef0ff; color: #3b44a6; }
  .listo { background: var(--ready-soft); color: var(--ready); }
  .entregado { background: #eceff3; color: var(--muted); }
  .cancelado { background: #eceff3; color: var(--muted); text-decoration: line-through; }
</style>
