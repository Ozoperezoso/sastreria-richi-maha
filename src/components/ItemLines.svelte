<script>
  // Garment lines of a ticket. Costs are typed as text ("10.000") and validated by the parent.
  /** items: {garment, fix, notes, costText}[] */
  let { items = $bindable(), warranty = false, errors = {} } = $props();

  const blank = () => ({ garment: '', fix: '', notes: '', costText: '' });

  function add() { items = [...items, blank()]; }
  function remove(index) { items = items.filter((_, i) => i !== index); }
</script>

<div class="lines">
  {#each items as item, index}
    <fieldset class="line">
      <legend>Prenda {index + 1}</legend>
      <div class="grid">
        <label class="field garment">
          <span>Prenda</span>
          <input class="input" name="garment" placeholder="Jean, chaqueta…" bind:value={item.garment} />
        </label>
        <label class="field fix">
          <span>Arreglo</span>
          <input class="input" name="fix" placeholder="Ruedo, cambio de cierre…" bind:value={item.fix} />
        </label>
        <label class="field cost">
          <span>Valor</span>
          <input class="input num" name="cost" inputmode="numeric" placeholder="$0"
            disabled={warranty} value={warranty ? '' : item.costText}
            oninput={(e) => (item.costText = e.currentTarget.value)} />
        </label>
        <label class="field note">
          <span>Nota (opcional)</span>
          <input class="input" name="item_notes" bind:value={item.notes} />
        </label>
      </div>
      {#if errors[index]}<p class="error">{errors[index]}</p>{/if}
      <button type="button" class="remove" onclick={() => remove(index)} disabled={items.length === 1}
        aria-label="Quitar prenda {index + 1}">✕ Quitar</button>
    </fieldset>
  {/each}
  <button type="button" class="btn" onclick={add}>+ Agregar prenda</button>
</div>

<style>
  .lines { display: grid; gap: 0.75rem; }
  .line { border: 1px solid var(--line); border-radius: var(--radius-control); padding: 0.75rem; margin: 0; display: grid; gap: 0.6rem; }
  legend { font-weight: 700; color: var(--indigo); padding: 0 0.3rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .garment, .fix { grid-column: span 2; }
  @media (min-width: 520px) {
    .garment, .fix { grid-column: span 1; }
  }
  .remove { justify-self: end; border: 0; background: none; color: var(--overdue); cursor: pointer; font-size: 0.875rem; min-height: 32px; }
  .remove:disabled { color: var(--muted); opacity: 0.5; cursor: default; }
</style>
