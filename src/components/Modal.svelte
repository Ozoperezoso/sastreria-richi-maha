<script>
  // Native <dialog>: focus trap, Escape to close and backdrop come from the browser.
  let { open = $bindable(false), title, children } = $props();
  let dialog;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="modal-title">
  <h2 id="modal-title">{title}</h2>
  {@render children()}
</dialog>

<style>
  dialog {
    width: min(92vw, 480px); border: 0; border-radius: 24px; padding: 1.5rem; color: var(--ink);
  }
  dialog::backdrop { background: rgba(21, 43, 36, 0.6); }
  h2 { margin-bottom: 1rem; font-size: 1.5rem; }
  /* Computador: aparece en su sitio. Teléfono: sube desde el borde, como un paso encima de la pantalla. */
  @keyframes pop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
  @keyframes rise { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes dim { from { opacity: 0; } to { opacity: 1; } }
  dialog[open] { animation: pop var(--base) var(--ease); }
  dialog[open]::backdrop { animation: dim var(--base) var(--ease); }
  @media (max-width: 600px) {
    dialog { width: 100%; max-width: 100%; margin: auto 0 0; border-radius: 24px 24px 0 0; }
    dialog[open] { animation: rise 280ms var(--ease); }
  }
</style>
