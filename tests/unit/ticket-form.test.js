import { describe, test, expect } from 'vitest';
import { validateTicketForm } from '../../src/lib/ticket-form.js';

const base = () => ({
  customer: { id: null, name: 'José Muñoz', phone: '311 555 0000' },
  received_on: '2026-10-31', due_on: '2026-11-04', assigned_to: 'uuid-alex',
  depositText: '5.000', warranty: false, notes: '',
  items: [
    { garment: 'Jean', fix: 'Ruedo', notes: '', costText: '10.000' },
    { garment: 'Blusa', fix: 'Costados', notes: '', costText: '$14.000' },
  ],
});

describe('validateTicketForm', () => {
  test('valid form produces the payload with parsed money and a total', () => {
    const { ok, value, total, errors } = validateTicketForm(base());
    expect(ok).toBe(true);
    expect(errors).toEqual({ items: {} });
    expect(total).toBe(24000);
    expect(value).toMatchObject({ deposit: 5000, assigned_to: 'uuid-alex', due_on: '2026-11-04' });
    expect(value.items).toEqual([
      { garment: 'Jean', fix: 'Ruedo', notes: '', cost: 10000 },
      { garment: 'Blusa', fix: 'Costados', notes: '', cost: 14000 },
    ]);
  });

  test('requires a customer name', () => {
    const form = base();
    form.customer = { id: null, name: '  ', phone: '' };
    expect(validateTicketForm(form).errors.customer).toBe('Elige o escribe el cliente');
    form.customer = null;
    expect(validateTicketForm(form).errors.customer).toBe('Elige o escribe el cliente');
  });

  test('flags a bad cost on the line where it was typed', () => {
    const form = base();
    form.items[1].costText = '14,5';
    const { ok, errors } = validateTicketForm(form);
    expect(ok).toBe(false);
    expect(errors.items).toEqual({ 1: 'Valor inválido' });
  });

  test('every garment needs a name', () => {
    const form = base();
    form.items[0].garment = '';
    expect(validateTicketForm(form).errors.items).toEqual({ 0: 'Escribe la prenda' });
  });

  test('bad deposit and missing tailor are reported', () => {
    const form = base();
    form.depositText = 'abc';
    form.assigned_to = '';
    const { errors } = validateTicketForm(form);
    expect(errors.deposit).toBe('Valor inválido');
    expect(errors.assigned_to).toBe('Elige quién hace el arreglo');
  });

  test('warranty makes every cost zero', () => {
    const form = base();
    form.warranty = true;
    form.items[0].costText = 'whatever';
    const { ok, value, total } = validateTicketForm(form);
    expect(ok).toBe(true);
    expect(total).toBe(0);
    expect(value.items.map((i) => i.cost)).toEqual([0, 0]);
  });

  test('due date before received date is a warning, not an error', () => {
    const form = base();
    form.due_on = '2026-10-30';
    const { ok, warning } = validateTicketForm(form);
    expect(ok).toBe(true);
    expect(warning).toBe('La fecha de entrega es anterior a la de recibido');
  });

  test('deposit larger than the total is an error', () => {
    const form = base();
    form.depositText = '30.000';
    expect(validateTicketForm(form).errors.deposit).toBe('El abono no puede ser mayor que el total');
  });
});

import { finalPriceChange } from '../../src/lib/ticket-form.js';

describe('finalPriceChange (price update at delivery)', () => {
  const one = [{ id: 'i1', garment: 'Jean', fix: 'Ruedo', notes: null, cost: 10000, position: 0 }];
  const two = [...one, { id: 'i2', garment: 'Blusa', fix: 'Costados', notes: null, cost: 14000, position: 1 }];

  test('same price changes nothing', () => {
    expect(finalPriceChange(two, 24000)).toEqual({ items: null });
  });
  test('a single garment gets the new cost', () => {
    expect(finalPriceChange(one, 16000)).toEqual({ items: [{ garment: 'Jean', fix: 'Ruedo', notes: null, cost: 16000 }] });
  });
  test('several garments get an adjustment line for the increase', () => {
    const { items } = finalPriceChange(two, 30000);
    expect(items.at(-1)).toEqual({ garment: 'Ajuste', fix: 'Ajuste de precio al entregar', notes: null, cost: 6000 });
    expect(items).toHaveLength(3);
  });
  test('lowering the price of several garments must go through Editar', () => {
    expect(finalPriceChange(two, 20000)).toEqual({ error: 'Para bajar el valor usa Editar' });
  });
});
