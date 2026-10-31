// Every Supabase call the screens make. Errors surface as Error(message); DB messages are already Spanish.
import { supabase } from './supabase.js';
import { OPEN_STATUSES } from './format.js';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const TICKET_NUMBER_RE = /^(\d+)(?:-([a-zA-Z]))?$/;

/**
 * Inicio list. A search (ticket number, customer name or phone) looks across every status and tailor;
 * without a search the "mine" and status filters apply.
 */
export async function listTickets({ q = '', mine = false, statuses = OPEN_STATUSES, userId = null, limit = 100 } = {}) {
  let query = supabase.from('ticket_overview').select('*');
  const term = q.trim();
  const numberMatch = TICKET_NUMBER_RE.exec(term);

  if (numberMatch) {
    query = query.eq('number', Number(numberMatch[1]));
    if (numberMatch[2]) query = query.eq('suffix', numberMatch[2].toUpperCase());
  } else if (term.length >= 2) {
    const customers = unwrap(await supabase.rpc('search_customers', { q: term, max_results: 30 }));
    if (!customers.length) return [];
    query = query.in('customer_id', customers.map((c) => c.id));
  } else {
    if (statuses?.length) query = query.in('status', statuses);
    if (mine && userId) query = query.eq('assigned_to', userId);
  }

  return unwrap(await query
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('number', { ascending: true })
    .limit(limit));
}

/** Customer picker: up to 8 matches by name or phone. */
export async function searchCustomers(q) {
  if (q.trim().length < 2) return [];
  return unwrap(await supabase.rpc('search_customers', { q, max_results: 8 }));
}

/** Active tailors, for the "assigned to" choice. */
export async function listTailors() {
  return unwrap(await supabase.from('profiles').select('id, full_name')
    .eq('role', 'tailor').eq('active', true).order('full_name'));
}

/**
 * @param {{customer: {id?: string, name: string, phone?: string}, received_on: string, due_on?: string,
 *          assigned_to: string, deposit: number, warranty: boolean, notes?: string,
 *          items: {garment: string, fix: string, notes?: string, cost: number}[]}} form
 */
export async function createTicket(form) {
  return unwrap(await supabase.rpc('create_ticket', {
    p_customer_id: form.customer.id ?? null,
    p_customer_name: form.customer.id ? null : form.customer.name,
    p_customer_phone: form.customer.id ? null : form.customer.phone || null,
    p_received_on: form.received_on,
    p_due_on: form.due_on || null,
    p_assigned_to: form.assigned_to,
    p_deposit: form.deposit,
    p_warranty: form.warranty,
    p_notes: form.notes || null,
    p_items: form.items,
  }));
}

/** One ticket with its garment lines. */
export async function getTicket(id) {
  const ticket = unwrap(await supabase.from('ticket_overview').select('*').eq('id', id).maybeSingle());
  if (!ticket) return null;
  const items = unwrap(await supabase.from('ticket_items').select('*').eq('ticket_id', id).order('position'));
  return { ticket, items };
}

/** Names for "created by / updated by" and the assignment choice. */
export async function profileNames() {
  const rows = unwrap(await supabase.from('profiles').select('id, full_name'));
  return Object.fromEntries(rows.map((p) => [p.id, p.full_name]));
}

export async function updateTicket(id, patch) {
  const rows = unwrap(await supabase.from('tickets').update(patch).eq('id', id).select('id'));
  if (!rows.length) throw new Error('No se pudo guardar el arreglo');
}

/** Replaces the garment lines: inserts the new ones first so a failure never leaves a ticket empty. */
export async function replaceItems(ticketId, items) {
  const old = unwrap(await supabase.from('ticket_items').select('id').eq('ticket_id', ticketId));
  unwrap(await supabase.from('ticket_items').insert(items.map((item, position) => ({
    ticket_id: ticketId, garment: item.garment, fix: item.fix ?? '', notes: item.notes || null,
    cost: item.cost, position,
  }))));
  if (old.length) unwrap(await supabase.from('ticket_items').delete().in('id', old.map((i) => i.id)));
}

export async function deleteTicket(id) {
  const rows = unwrap(await supabase.from('tickets').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('No se pudo eliminar el arreglo');
}

/** Admin: money and counts per tailor for a date range (admin_totals). */
export async function adminTotals(from, to) {
  return unwrap(await supabase.rpc('admin_totals', { p_from: from, p_to: to }));
}

/** Admin: number of tickets in each status. */
export async function statusCounts(statuses) {
  const counts = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw new Error(error.message);
    return [status, count];
  }));
  return Object.fromEntries(counts);
}

export async function overdueTickets(limit = 50) {
  return unwrap(await supabase.from('ticket_overview').select('*').eq('overdue', true)
    .order('due_on', { ascending: true }).limit(limit));
}

const EXPORT_PAGE = 500;

/** Admin "Todos": filtered tickets, newest first. Pass page (0-based) for 500-row pages. */
export async function listAllTickets({ tailor = '', statuses = [], from = '', to = '' } = {}, page = 0) {
  let query = supabase.from('ticket_overview').select('*');
  if (tailor) query = query.eq('assigned_to', tailor);
  if (statuses.length) query = query.in('status', statuses);
  if (from) query = query.gte('received_on', from);
  if (to) query = query.lte('received_on', to);
  return unwrap(await query.order('number', { ascending: false }).order('suffix')
    .range(page * EXPORT_PAGE, page * EXPORT_PAGE + EXPORT_PAGE - 1));
}

/** Every page of listAllTickets, for the CSV export. */
export async function exportTickets(filters) {
  const rows = [];
  for (let page = 0; ; page++) {
    const batch = await listAllTickets(filters, page);
    rows.push(...batch);
    if (batch.length < EXPORT_PAGE) return rows;
  }
}
