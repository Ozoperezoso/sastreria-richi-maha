<script>
  import { toast } from '../lib/toast.svelte.js';
</script>

<div class="toast" class:on={toast.visible} role="status" aria-live="polite">
  {#if toast.text}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>
    <span>{toast.text}</span>
  {/if}
</div>

<style>
  .toast {
    position: fixed; z-index: 30; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom));
    width: min(calc(100% - 32px), 420px); box-sizing: border-box;
    display: flex; align-items: center; gap: 0.6rem; padding: 0.8rem 1rem; border-radius: 14px;
    background: var(--ink); color: #fff; font-weight: 600; box-shadow: 0 8px 24px rgba(21, 43, 36, 0.25);
    transform: translate(-50%, 150%); opacity: 0; pointer-events: none;
    transition: transform 280ms var(--ease), opacity 200ms;
  }
  .toast svg { color: var(--thread); flex: none; }
  .toast.on { transform: translate(-50%, 0); opacity: 1; }
  /* Above the admin's bottom bar on phones. */
  @media (max-width: 720px) { :global(body.has-bottom-nav) .toast { bottom: calc(84px + env(safe-area-inset-bottom)); } }
</style>
