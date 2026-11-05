import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, signedIn } from './env.js';
import { runImport } from '../../scripts/import/run.js';

const csvText = readFileSync('tests/fixtures/sample.csv', 'utf8');
const db = serviceClient();

async function cleanup() {
  await db.from('tickets').delete().gte('number', 3000).lte('number', 3999);
  await db.from('customers').delete().like('name', 'PRUEBA IMPORT%');
}
const fixtureTickets = async () => {
  const { data } = await db.from('ticket_overview').select('*').gte('number', 3000).lte('number', 3999).order('number').order('suffix');
  return data;
};

describe('runImport', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  test('dry run reports what it would do and writes nothing', async () => {
    const result = await runImport({ csvText, mode: 'dry-run', shop: 'la-union', client: db });
    expect(result.summary).toMatchObject({ rows: 10, tickets: 9, customers: 8, merged: 1, suffixed: 1, problems: 0 });
    expect(result.toInsert).toBe(9);
    expect(await fixtureTickets()).toEqual([]);
  });

  test('--since imports only newer numbers', async () => {
    const result = await runImport({ csvText, mode: 'commit', shop: 'la-union', since: 3005, client: db });
    expect(result.inserted).toBe(3);
    expect((await fixtureTickets()).map((t) => t.display_number)).toEqual(['3006', '3007', '3009']);
  });

  test('commit inserts the rest with mapped values', async () => {
    const result = await runImport({ csvText, mode: 'commit', shop: 'la-union', client: db });
    expect(result.inserted).toBe(6);
    const tickets = await fixtureTickets();
    expect(tickets.map((t) => t.display_number)).toEqual(
      ['3000', '3001', '3002', '3003', '3003-B', '3004', '3006', '3007', '3009']);
    const byNumber = Object.fromEntries(tickets.map((t) => [t.display_number, t]));
    expect(byNumber['3002']).toMatchObject({
      status: 'entregado', delivered_on: '2026-07-22', location: 'A', picked_up_by: 'PERSONA TRES',
      total: 16000, balance: 0, paid_in_full: true, assigned_name: 'Claudia Alvarez',
    });
    expect(byNumber['3003']).toMatchObject({ items_summary: 'JEAN, BLUSA, Sudadera', total: 28000, status: 'listo' });
    expect(byNumber['3006']).toMatchObject({ total: 14000, deposit: 5000, balance: 9000, status: 'en_proceso' });
    expect(byNumber['3004']).toMatchObject({ warranty: true, customer_phone: null });
    expect(byNumber['3000'].created_at).toBe('2026-04-21T20:20:10+00:00');
    expect(byNumber['3000'].customer_id).toBe(byNumber['3006'].customer_id);
  });

  test('running commit again inserts nothing new', async () => {
    const result = await runImport({ csvText, mode: 'commit', shop: 'la-union', client: db });
    expect(result.inserted).toBe(0);
    const { count } = await db.from('customers').select('id', { count: 'exact', head: true }).like('name', 'PRUEBA IMPORT%');
    expect(count).toBe(8);
  });

  test('after import, new tickets continue from the highest number', async () => {
    const alexander = await signedIn('alexander');
    const { data, error } = await alexander.rpc('create_ticket', {
      p_customer_id: null, p_customer_name: 'PRUEBA IMPORT NUEVO', p_customer_phone: null,
      p_received_on: null, p_due_on: null, p_assigned_to: '11111111-1111-1111-1111-111111111111',
      p_deposit: 0, p_warranty: false, p_notes: null, p_items: [{ garment: 'Jean', fix: 'Ruedo', cost: 1000 }],
    });
    expect(error).toBeNull();
    expect(data.number).toBeGreaterThanOrEqual(3010);
  });

  test('commit refuses to run when the sheet has problems', async () => {
    const bad = csvText.replace('3009,26/04/2026 13:00:00,PRUEBA IMPORT OCHO,3009990008,26/04/2026',
      '3009,26/04/2026 13:00:00,PRUEBA IMPORT OCHO,3009990008,31/02/2026');
    await expect(runImport({ csvText: bad, mode: 'commit', shop: 'la-union', client: db }))
      .rejects.toThrow('Hay 1 problema(s) en el archivo');
  });
});
