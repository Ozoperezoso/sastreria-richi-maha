import { expect } from '@playwright/test';

export async function login(page, username, password = 'test1234') {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}

/** Fills garment line `index` (0-based) of the ticket form. */
export async function fillItem(page, index, { garment, fix, cost }) {
  await page.locator('input[name=garment]').nth(index).fill(garment);
  await page.locator('input[name=fix]').nth(index).fill(fix);
  if (cost !== undefined) await page.locator('input[name=cost]').nth(index).fill(cost);
}

// Test data written directly with the service key (local stack only, from .env.local).
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export const ALEXANDER_ID = '11111111-1111-1111-1111-111111111111';

export function serviceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Inserts a throwaway ticket for `customerName` and returns its id. */
// Seed shop (supabase/seed.sql). Rows written with the service role get no default shop.
const LA_UNION_ID = '00000000-0000-0000-0000-00000000a001';

export async function seedTicket(customerName, assignedTo = ALEXANDER_ID) {
  const db = serviceClient();
  const { data: customer, error: e1 } = await db.from('customers')
    .insert({ name: customerName, shop_id: LA_UNION_ID }).select('id').single();
  if (e1) throw e1;
  const { data: ticket, error: e2 } = await db.from('tickets').insert({
    shop_id: LA_UNION_ID, number: 900000 + Math.floor(Math.random() * 99999), customer_id: customer.id, assigned_to: assignedTo,
    received_on: new Date().toISOString().slice(0, 10), status: 'recibido',
  }).select('id').single();
  if (e2) throw e2;
  const { error: e3 } = await db.from('ticket_items').insert({ ticket_id: ticket.id, garment: 'Jean', fix: 'Ruedo', cost: 1000 });
  if (e3) throw e3;
  return ticket.id;
}
