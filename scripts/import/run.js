// Imports the BD_Registros sheet export into Supabase (spec §6).
// Usage: node scripts/import/run.js <file.csv> --shop <código> --dry-run | --commit [--since <number>] [--allow-problems]
// Everything goes to one shop (El Sastre hosts several); --shop is that shop's code, for example la-union.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local, or .env.production.local via --env).
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseCSV } from './csv.js';
import { mapRows } from './map.js';
import { normalizeName, normalizePhone } from './parse.js';

const BATCH = 200;
const PAGE = 1000;

async function selectAll(query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadShop(client, slug) {
  const { data, error } = await client.from('shops').select('id, name').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No existe una sastrería con el código "${slug}"`);
  return data;
}

async function loadTailorIds(client, shopId) {
  const { data, error } = await client.from('profiles').select('id, full_name').eq('role', 'tailor').eq('shop_id', shopId);
  if (error) throw error;
  return Object.fromEntries(data.map((p) => [p.full_name, p.id]));
}

/**
 * @param {{csvText: string, mode: 'dry-run'|'commit', since?: number, allowProblems?: boolean, client: any}} options
 * @returns {Promise<{summary: object, problems: string[], skipped: string[], toInsert: number, inserted: number}>}
 */
export async function runImport({ csvText, mode, shop, since = 0, allowProblems = false, client }) {
  const { id: shopId, name: shopName } = await loadShop(client, shop);
  const { customers, tickets, problems, skipped, summary } = mapRows(parseCSV(csvText), await loadTailorIds(client, shopId));

  const existing = await selectAll(() => client.from('tickets').select('number, suffix').eq('shop_id', shopId));
  const existingKeys = new Set(existing.map((t) => `${t.number}|${t.suffix}`));
  const pending = tickets.filter((t) => t.number > since && !existingKeys.has(`${t.number}|${t.suffix}`));

  const result = { shop: shopName, summary, problems, skipped, toInsert: pending.length, inserted: 0 };
  if (mode !== 'commit') return result;
  if (problems.length && !allowProblems) throw new Error(`Hay ${problems.length} problema(s) en el archivo`);

  // Customers: reuse any whose normalized name + phone already exist.
  const known = await selectAll(() => client.from('customers').select('id, name, phone').eq('shop_id', shopId));
  const idByKey = new Map(known.map((c) => [`${normalizeName(c.name)}|${normalizePhone(c.phone)}`, c.id]));
  const neededKeys = new Set(pending.map((t) => t.customerKey));
  const newCustomers = customers.filter((c) => neededKeys.has(c.key) && !idByKey.has(c.key));
  for (const batch of chunks(newCustomers, BATCH)) {
    const { data, error } = await client.from('customers')
      .insert(batch.map(({ name, phone }) => ({ name, phone, shop_id: shopId }))).select('id, name, phone');
    if (error) throw error;
    data.forEach((c) => idByKey.set(`${normalizeName(c.name)}|${normalizePhone(c.phone)}`, c.id));
  }

  for (const batch of chunks(pending, BATCH)) {
    const rows = batch.map(({ customerKey, items, ...ticket }) => ({ ...ticket, shop_id: shopId, customer_id: idByKey.get(customerKey) }));
    const { data, error } = await client.from('tickets').insert(rows).select('id, number, suffix');
    if (error) throw error;
    const idOf = new Map(data.map((t) => [`${t.number}|${t.suffix}`, t.id]));
    const items = batch.flatMap((t) => t.items.map((item, position) => ({
      ...item, position, ticket_id: idOf.get(`${t.number}|${t.suffix}`),
    })));
    const { error: itemsError } = await client.from('ticket_items').insert(items);
    if (itemsError) throw itemsError;
    result.inserted += data.length;
  }

  const { error: seqError } = await client.rpc('sync_shop_ticket_number', { p_shop: shopId });
  if (seqError) throw seqError;
  return result;
}

function printReport(result, mode) {
  const s = result.summary;
  console.log(`Sastrería: ${result.shop}`);
  console.log(`Filas leídas: ${s.rows}`);
  console.log(`Arreglos: ${s.tickets} (fusionados ${s.merged}, con sufijo ${s.suffixed}) · Clientes: ${s.customers}`);
  console.log(`Por estado: ${JSON.stringify(s.byStatus)}`);
  console.log(`Por sastre: ${JSON.stringify(s.byTailor)}`);
  console.log(`Garantías: ${s.warranty} · Número más alto: ${s.maxNumber}`);
  console.log(`Omitidos, entregados antes de recibidos: ${result.skipped.length}`);
  result.skipped.forEach((line) => console.log(`  - ${line}`));
  console.log(`Problemas: ${result.problems.length}`);
  result.problems.forEach((p) => console.log(`  - ${p}`));
  console.log(mode === 'commit'
    ? `Importados: ${result.inserted}`
    : `Se importarían: ${result.toInsert} (simulación, no se escribió nada)`);
}

async function main(argv) {
  const file = argv.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const mode = argv.includes('--commit') ? 'commit' : argv.includes('--dry-run') ? 'dry-run' : null;
  const sinceIndex = argv.indexOf('--since');
  const since = sinceIndex >= 0 ? Number(argv[sinceIndex + 1]) : 0;
  const envIndex = argv.indexOf('--env');
  const envFile = envIndex >= 0 ? argv[envIndex + 1] : '.env.local';
  const shopIndex = argv.indexOf('--shop');
  const shop = shopIndex >= 0 ? argv[shopIndex + 1] : '';
  if (!file || !mode || !shop || Number.isNaN(since)) {
    console.error('Uso: node scripts/import/run.js <archivo.csv> --shop <código> --dry-run | --commit [--since N] [--allow-problems] [--env archivo]');
    process.exit(2);
  }
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log(`Base de datos: ${process.env.SUPABASE_URL}`);
  try {
    const result = await runImport({
      csvText: readFileSync(file, 'utf8'), mode, shop, since, allowProblems: argv.includes('--allow-problems'), client,
    });
    printReport(result, mode);
    if (result.problems.length && !argv.includes('--allow-problems')) process.exit(1);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
