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
  /* En el teléfono la ventana sale desde abajo. */
  @media (max-width: 600px) {
    dialog { width: 100%; max-width: 100%; margin: auto 0 0; border-radius: 24px 24px 0 0; }
  }
</style>
