// Validation for the new-ticket and edit forms. Pure, so it is unit-tested.
import { parseCOPInput } from './format.js';

function money(text) {
  try { return { value: parseCOPInput(text) }; } catch (e) { return { error: e.message }; }
}

/**
 * @returns {{ok: boolean, value: object, total: number, errors: {customer?, deposit?, assigned_to?, items: Record<number,string>}, warning: string}}
 */
export function validateTicketForm(form) {
  const errors = { items: {} };

  const customer = form.customer;
  if (!customer || (!customer.id && !customer.name?.trim())) errors.customer = 'Elige o escribe el cliente';
  if (!form.assigned_to) errors.assigned_to = 'Elige quién hace el arreglo';

  const items = form.items.map((item, index) => {
    if (!item.garment.trim()) errors.items[index] = 'Escribe la prenda';
    const cost = form.warranty ? { value: 0 } : money(item.costText);
    if (cost.error && !errors.items[index]) errors.items[index] = cost.error;
    return { garment: item.garment.trim(), fix: item.fix.trim(), notes: item.notes.trim(), cost: cost.value ?? 0 };
  });
  const total = items.reduce((sum, item) => sum + item.cost, 0);

  const deposit = money(form.depositText);
  if (deposit.error) errors.deposit = deposit.error;
  else if (!form.warranty && deposit.value > total) errors.deposit = 'El abono no puede ser mayor que el total';

  const warning = form.due_on && form.received_on && form.due_on < form.received_on
    ? 'La fecha de entrega es anterior a la de recibido' : '';

  const ok = !errors.customer && !errors.assigned_to && !errors.deposit && !Object.keys(errors.items).length;
  return {
    ok,
    total,
    errors,
    warning,
    value: {
      customer, received_on: form.received_on, due_on: form.due_on || null, assigned_to: form.assigned_to,
      deposit: deposit.value ?? 0, warranty: form.warranty, notes: form.notes?.trim() ?? '', items,
    },
  };
}

/**
 * Price update at delivery (the price often goes up once the work is done).
 * Returns the full replacement item list, null when nothing changes, or an error.
 * @param {{garment, fix, notes, cost}[]} items  current items in position order
 * @param {number} finalValue
 */
export function finalPriceChange(items, finalValue) {
  const total = items.reduce((sum, item) => sum + item.cost, 0);
  if (finalValue === total) return { items: null };
  const plain = items.map(({ garment, fix, notes, cost }) => ({ garment, fix, notes, cost }));
  if (plain.length === 1) return { items: [{ ...plain[0], cost: finalValue }] };
  if (finalValue < total) return { error: 'Para bajar el valor usa Editar' };
  return { items: [...plain, { garment: 'Ajuste', fix: 'Ajuste de precio al entregar', notes: null, cost: finalValue - total }] };
}
