<script>
  // Where a finished garment is stored: shelves A–E, the drawer or the storeroom.
  import { LOCATIONS, locationLabel } from '../lib/format.js';
  let { value = $bindable(null) } = $props();
</script>

<div class="grid" role="radiogroup" aria-label="Ubicación de la prenda">
  {#each LOCATIONS as location}
    <label class="option" class:wide={location.length > 1}>
      <input type="radio" name="location" value={location} bind:group={value} />
      <span>{locationLabel(location)}</span>
    </label>
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
  .wide { grid-column: span 5; }
  @media (min-width: 400px) { .wide { grid-column: span 2; } .grid { grid-template-columns: repeat(5, 1fr); } }
  .option { position: relative; }
  .option input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .option span {
    display: grid; place-items: center; min-height: 52px; border: 2px solid var(--line); border-radius: var(--radius-control);
    font-size: 1.15rem; font-weight: 750; background: var(--paper);
  }
  .option input:checked + span { border-color: var(--indigo); background: var(--indigo); color: var(--thread); }
  .option input:focus-visible + span { outline: 3px solid var(--thread); outline-offset: 2px; }
</style>
