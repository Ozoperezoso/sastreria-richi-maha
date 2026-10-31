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
