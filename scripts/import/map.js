// Maps BD_Registros rows to customers and tickets (spec §6). Pure: no I/O.
import { parseDate, parseTimestamp, parseMoney, normalizeName, normalizePhone } from './parse.js';

export const HEADER = [
  'Consecutivo', 'Marca temporal', 'Nombre Cliente', 'Telefono', 'Fecha', 'Fecha Estimada de Entrega',
  'Tipo de Prenda', 'Tipo de Arreglo', 'Notas', 'Fecha Real de entrega', 'Realizado por', 'Saldo Pendiente',
  'Estado', 'Valor del Arreglo', 'Valor Real Arreglo', 'Abono', 'Abono Final', 'mes', 'Quien Recogio?',
  'Ubicación de la Prenda', 'Valor Arreglo 2.0',
];

const LOCATIONS = new Set(['A', 'B', 'C', 'D', 'E', 'CAJON', 'BODEGA']);
const WARRANTY_RE = /\bG(?:A)?RANT(?:R)?IA\b/i; // GARANTIA, GRANTIA, GRANTRIA

/**
 * @param {string[][]} rows  CSV rows including the header row
 * @param {Record<string, string>} tailorIds  'Realizado por' value → profile id
 */
export function mapRows(rows, tailorIds) {
  const [header, ...body] = rows;
  const col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const missing = HEADER.filter((h) => !(h in col) && !['Valor Real Arreglo', 'mes', 'Valor Arreglo 2.0'].includes(h));
  if (missing.length) throw new Error(`Faltan columnas: ${missing.join(', ')}`);

  const problems = [];
  // Rows left out on purpose (not errors): delivered before they were received, a typing error in the sheet.
  const skipped = [];
  const customers = new Map();
  const parsed = [];
  let dataRows = 0;

  body.forEach((cells, index) => {
    if (!cells.some((v) => String(v ?? '').trim())) return;
    dataRows++;
    const get = (name) => String(cells[col[name]] ?? '').trim();
    const number = Number.parseInt(get('Consecutivo'), 10);
    const where = `Fila ${index + 2} (N° ${get('Consecutivo') || '?'})`;
    const fail = (message) => { problems.push(`${where}: ${message}`); };

    if (!Number.isInteger(number) || number <= 0) return fail('número de arreglo inválido');
    const name = normalizeName(get('Nombre Cliente'));
    if (!name) return fail('falta el nombre del cliente');
    const assigned = tailorIds[get('Realizado por')];
    if (!assigned) return fail(`sastre desconocido "${get('Realizado por')}"`);
    const garment = get('Tipo de Prenda');
    if (!garment) return fail('falta el tipo de prenda');

    const received = parseDate(get('Fecha'));
    if (!received) return fail(`fecha de ingreso inválida "${get('Fecha')}"`);
    const dateOrProblem = (field, label) => {
      const raw = get(field);
      if (!raw) return { value: null };
      const value = parseDate(raw);
      return value ? { value } : { error: `${label} inválida "${raw}"` };
    };
    const due = dateOrProblem('Fecha Estimada de Entrega', 'fecha estimada');
    if (due.error) return fail(due.error);
    const delivered = dateOrProblem('Fecha Real de entrega', 'fecha de entrega');
    if (delivered.error) return fail(delivered.error);
    if (delivered.value && delivered.value < received) {
      skipped.push(`N° ${get('Consecutivo')}: entregado (${get('Fecha Real de entrega')}) antes de recibido (${get('Fecha')})`);
      return;
    }

    const location = LOCATIONS.has(get('Ubicación de la Prenda').toUpperCase()) ? get('Ubicación de la Prenda').toUpperCase() : null;
    const status = delivered.value ? 'entregado' : get('Estado') === 'Listo' ? 'listo' : 'en_proceso';
    if (status === 'listo' && !location) return fail('está "Listo" pero no tiene ubicación');

    const advance = Math.max(parseMoney(get('Abono')) ?? 0, 0);
    const finalPayment = Math.max(parseMoney(get('Abono Final')) ?? 0, 0);
    const price = Math.max(parseMoney(get('Valor del Arreglo')) ?? 0, 0);
    const cost = Math.max(price, advance + finalPayment);
    const paid = status === 'entregado' && cost - advance - finalPayment <= 0;

    const phone = normalizePhone(get('Telefono'));
    const customerKey = `${name}|${phone}`;
    if (!customers.has(customerKey)) customers.set(customerKey, { key: customerKey, name, phone: phone || null });

    const pickedUp = get('Quien Recogio?');
    const notes = get('Notas');
    parsed.push({
      number,
      suffix: '',
      customerKey,
      assigned_to: assigned,
      received_on: received,
      due_on: due.value,
      delivered_on: delivered.value,
      status,
      location,
      picked_up_by: pickedUp && pickedUp.toUpperCase() !== 'NO REGISTRA' ? pickedUp : null,
      // Fully paid: the advance is the deposit. Otherwise every payment so far counts toward the balance.
      deposit: paid ? advance : advance + finalPayment,
      paid_in_full: paid,
      warranty: WARRANTY_RE.test(notes),
      notes: notes || null,
      created_at: parseTimestamp(get('Marca temporal')),
      legacy: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])),
      items: [{ garment, fix: get('Tipo de Arreglo'), notes: null, cost }],
    });
  });

  // Duplicate numbers: same customer → one ticket with several items; different customer → suffix B, C…
  const tickets = [];
  const byNumber = new Map();
  let merged = 0;
  let suffixed = 0;
  for (const ticket of parsed) {
    const group = byNumber.get(ticket.number) ?? [];
    const sameCustomer = group.find((t) => t.customerKey === ticket.customerKey);
    if (sameCustomer) {
      sameCustomer.items.push(...ticket.items);
      sameCustomer.deposit += ticket.deposit;
      sameCustomer.paid_in_full = sameCustomer.paid_in_full && ticket.paid_in_full;
      merged++;
      continue;
    }
    if (group.length) {
      ticket.suffix = String.fromCharCode(65 + group.length); // B, C, …
      suffixed++;
    }
    group.push(ticket);
    byNumber.set(ticket.number, group);
    tickets.push(ticket);
  }

  const count = (values) => values.reduce((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  const nameById = Object.fromEntries(Object.entries(tailorIds).map(([n, id]) => [id, n]));
  return {
    customers: [...customers.values()],
    tickets,
    problems,
    skipped,
    summary: {
      rows: dataRows,
      tickets: tickets.length,
      customers: customers.size,
      maxNumber: tickets.reduce((max, t) => Math.max(max, t.number), 0),
      merged,
      suffixed,
      byStatus: count(tickets.map((t) => t.status)),
      byTailor: count(tickets.map((t) => nameById[t.assigned_to])),
      warranty: tickets.filter((t) => t.warranty).length,
      problems: problems.length,
      skipped: skipped.length,
    },
  };
}
