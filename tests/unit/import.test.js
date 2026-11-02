import { describe, test, expect } from 'vitest';
import { parseCSV } from '../../scripts/import/csv.js';
import { parseDate, parseTimestamp, parseMoney, normalizeName, normalizePhone } from '../../scripts/import/parse.js';
import { mapRows, HEADER } from '../../scripts/import/map.js';

const TAILORS = { 'Alexander Rengifo': 'uuid-alex', 'Claudia Alvarez': 'uuid-clau' };

// Builds a BD_Registros row from the fields that matter; everything else defaults to the sheet's usual values.
function row(fields) {
  const defaults = {
    'Consecutivo': '100', 'Marca temporal': '21/04/2026 15:20:10', 'Nombre Cliente': 'ANA PRUEBA',
    'Telefono': '3001234567', 'Fecha': '21/04/2026', 'Fecha Estimada de Entrega': '25/04/2026',
    'Tipo de Prenda': 'Jean', 'Tipo de Arreglo': 'Ruedo', 'Notas': '', 'Fecha Real de entrega': '',
    'Realizado por': 'Alexander Rengifo', 'Saldo Pendiente': '', 'Estado': '-', 'Valor del Arreglo': ' $10.000',
    'Valor Real Arreglo': '', 'Abono': '', 'Abono Final': '', 'mes': '4', 'Quien Recogio?': 'No Registra',
    'Ubicación de la Prenda': '-', 'Valor Arreglo 2.0': '',
  };
  const merged = { ...defaults, ...fields };
  return HEADER.map((h) => merged[h]);
}
const map = (...rows) => mapRows([HEADER, ...rows], TAILORS);

describe('parse helpers', () => {
  test('parseDate converts d/mm/yyyy and ignores a time part', () => {
    expect(parseDate('9/04/2026')).toBe('2026-04-09');
    expect(parseDate('21/04/2026 15:20:10')).toBe('2026-04-21');
  });
  test('parseDate reads Google Sheets serial dates (days since 1899-12-30)', () => {
    expect(parseDate('46225')).toBe('2026-07-22');
    expect(parseDate('46023')).toBe('2026-01-01');
  });
  test('parseDate rejects numbers outside a plausible serial range', () => {
    expect(parseDate('123')).toBeNull();
    expect(parseDate('99999')).toBeNull();
  });
  test('parseDate rejects impossible dates and blanks', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('abc')).toBeNull();
  });
  test('parseTimestamp keeps the time in Bogota offset', () => {
    expect(parseTimestamp('21/04/2026 15:20:10')).toBe('2026-04-21T15:20:10-05:00');
    expect(parseTimestamp('1/07/2026 9:05:00')).toBe('2026-07-01T09:05:00-05:00');
  });
  test('parseMoney reads sheet currency including negatives', () => {
    expect(parseMoney(' $24.000')).toBe(24000);
    expect(parseMoney('- $6.000')).toBe(-6000);
    expect(parseMoney(' $0')).toBe(0);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(' ')).toBeNull();
  });
  test('normalizeName trims, collapses spaces and uppercases', () => {
    expect(normalizeName('  maryluz   botero ')).toBe('MARYLUZ BOTERO');
  });
  test('normalizePhone keeps digits and drops a +57 prefix', () => {
    expect(normalizePhone('311 234-5678')).toBe('3112345678');
    expect(normalizePhone('+57 311 234 5678')).toBe('3112345678');
    expect(normalizePhone('')).toBe('');
  });
});

describe('parseCSV', () => {
  test('keeps quoted commas, doubled quotes and newlines inside a field', () => {
    const rows = parseCSV('a,b\n1,"x, ""y""\nz"\n');
    expect(rows).toEqual([['a', 'b'], ['1', 'x, "y"\nz']]);
  });
  test('handles CRLF line endings', () => {
    expect(parseCSV('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('mapRows', () => {
  test('customer paid more than recorded price: cost is what was paid, ticket delivered and paid', () => {
    const { tickets } = map(row({
      'Valor del Arreglo': ' $10.000', 'Abono Final': ' $16.000', 'Saldo Pendiente': '- $6.000',
      'Estado': 'Listo', 'Fecha Real de entrega': '29/04/2026', 'Ubicación de la Prenda': 'A', 'Quien Recogio?': 'VIVIANA',
    }));
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      status: 'entregado', delivered_on: '2026-04-29', paid_in_full: true, picked_up_by: 'VIVIANA', location: 'A',
    });
    expect(tickets[0].items).toEqual([{ garment: 'Jean', fix: 'Ruedo', notes: null, cost: 16000 }]);
  });

  test('a delivered ticket still owing keeps the unpaid balance', () => {
    const { tickets } = map(row({
      'Valor del Arreglo': ' $24.000', 'Abono': ' $5.000', 'Abono Final': ' $10.000',
      'Fecha Real de entrega': '29/04/2026',
    }));
    expect(tickets[0]).toMatchObject({ paid_in_full: false, deposit: 15000 });
    expect(tickets[0].items[0].cost).toBe(24000);
  });

  test('"-" without delivery is en_proceso; "Listo" without delivery is listo with its location', () => {
    const { tickets } = map(
      row({ 'Consecutivo': '1' }),
      row({ 'Consecutivo': '2', 'Estado': 'Listo', 'Ubicación de la Prenda': 'B' }),
    );
    expect(tickets.map((t) => [t.number, t.status, t.location])).toEqual([[1, 'en_proceso', null], [2, 'listo', 'B']]);
  });

  test('"No Registra" becomes no picked_up_by and "-" location becomes null', () => {
    const { tickets } = map(row({}));
    expect(tickets[0].picked_up_by).toBeNull();
    expect(tickets[0].location).toBeNull();
  });

  test('GARANTIA spellings set warranty', () => {
    const { tickets } = map(
      row({ 'Consecutivo': '1', 'Notas': 'GRANTIA' }),
      row({ 'Consecutivo': '2', 'Notas': 'garantia' }),
      row({ 'Consecutivo': '3', 'Notas': 'GRANTRIA' }),
      row({ 'Consecutivo': '4', 'Notas': 'FORRO SOFA' }),
    );
    expect(tickets.map((t) => t.warranty)).toEqual([true, true, true, false]);
  });

  test('duplicate number: same customer merges, different customer gets a suffix', () => {
    const { tickets, summary } = map(
      row({ 'Consecutivo': '136', 'Nombre Cliente': 'LIDIS TUIRAN', 'Telefono': '3001' }),
      row({ 'Consecutivo': '136', 'Nombre Cliente': 'DORY RENDON', 'Telefono': '3002', 'Tipo de Prenda': '2 LEGUIN',
            'Realizado por': 'Claudia Alvarez' }),
      row({ 'Consecutivo': '136', 'Nombre Cliente': 'DORY RENDON', 'Telefono': '3002', 'Tipo de Prenda': 'LEGIS',
            'Realizado por': 'Claudia Alvarez' }),
    );
    expect(tickets.map((t) => [t.number, t.suffix, t.items.length])).toEqual([[136, '', 1], [136, 'B', 2]]);
    expect(tickets[1].items.map((i) => i.garment)).toEqual(['2 LEGUIN', 'LEGIS']);
    expect(summary).toMatchObject({ merged: 1, suffixed: 1 });
  });

  test('an impossible date is reported and the row skipped', () => {
    const { tickets, problems } = map(row({ 'Consecutivo': '7', 'Fecha': '31/02/2026' }));
    expect(tickets).toHaveLength(0);
    expect(problems).toEqual(['Fila 2 (N° 7): fecha de ingreso inválida "31/02/2026"']);
  });

  test('delivered before it was received: the row is skipped and listed, not imported', () => {
    const { tickets, skipped, problems, summary } = map(
      row({ 'Consecutivo': '613', 'Fecha': '21/04/2026', 'Fecha Real de entrega': '20/04/2026' }),
      row({ 'Consecutivo': '614', 'Fecha': '21/04/2026', 'Fecha Real de entrega': '21/04/2026' }),
    );
    expect(tickets.map((t) => t.number)).toEqual([614]);
    expect(skipped).toEqual(['N° 613: entregado (20/04/2026) antes de recibido (21/04/2026)']);
    expect(problems).toEqual([]);
    expect(summary.skipped).toBe(1);
  });
  test('an unknown tailor is reported', () => {
    const { problems } = map(row({ 'Consecutivo': '8', 'Realizado por': 'Pedro' }));
    expect(problems).toEqual(['Fila 2 (N° 8): sastre desconocido "Pedro"']);
  });

  test('"Listo" without a location is reported', () => {
    const { problems } = map(row({ 'Consecutivo': '9', 'Estado': 'Listo', 'Ubicación de la Prenda': '-' }));
    expect(problems).toEqual(['Fila 2 (N° 9): está "Listo" pero no tiene ubicación']);
  });

  test('customers are deduplicated by normalized name and phone', () => {
    const { customers, tickets } = map(
      row({ 'Consecutivo': '1', 'Nombre Cliente': ' Ana  Prueba', 'Telefono': '300 123 4567' }),
      row({ 'Consecutivo': '2', 'Nombre Cliente': 'ANA PRUEBA', 'Telefono': '3001234567' }),
      row({ 'Consecutivo': '3', 'Nombre Cliente': 'ANA PRUEBA', 'Telefono': '' }),
    );
    expect(customers).toEqual([
      { key: 'ANA PRUEBA|3001234567', name: 'ANA PRUEBA', phone: '3001234567' },
      { key: 'ANA PRUEBA|', name: 'ANA PRUEBA', phone: null },
    ]);
    expect(tickets.map((t) => t.customerKey)).toEqual(['ANA PRUEBA|3001234567', 'ANA PRUEBA|3001234567', 'ANA PRUEBA|']);
  });

  test('summary counts statuses, tailors and the highest number; blank rows are ignored', () => {
    const blank = HEADER.map(() => '');
    const { summary, tickets } = map(
      row({ 'Consecutivo': '20' }),
      row({ 'Consecutivo': '2711', 'Realizado por': 'Claudia Alvarez', 'Fecha Real de entrega': '1/05/2026' }),
      blank,
    );
    expect(tickets[0].created_at).toBe('2026-04-21T15:20:10-05:00');
    expect(tickets[0].legacy['Consecutivo']).toBe('20');
    expect(summary).toMatchObject({
      rows: 2, tickets: 2, customers: 1, maxNumber: 2711,
      byStatus: { en_proceso: 1, entregado: 1 },
      byTailor: { 'Alexander Rengifo': 1, 'Claudia Alvarez': 1 },
    });
  });
});
