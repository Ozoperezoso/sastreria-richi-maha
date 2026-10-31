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
    width: min(92vw, 480px); border: 0; border-radius: var(--radius-tag); padding: 1.25rem;
    border-top: 4px solid var(--thread); color: var(--ink);
  }
  dialog::backdrop { background: rgba(25, 42, 68, 0.55); }
  h2 { margin-bottom: 1rem; }
</style>
