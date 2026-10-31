// Display and input helpers. COP has no decimals; dates show as d/mm/yyyy like the old sheet.

const STATUS_LABELS = {
  recibido: 'Recibido',
  en_proceso: 'En proceso',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};
const LOCATION_LABELS = { CAJON: 'Cajón', BODEGA: 'Bodega' };

export const STATUSES = Object.keys(STATUS_LABELS);
export const OPEN_STATUSES = ['recibido', 'en_proceso', 'listo'];
export const LOCATIONS = ['A', 'B', 'C', 'D', 'E', 'CAJON', 'BODEGA'];

export function formatCOP(amount) {
  const value = Math.round(Number(amount) || 0);
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}$${digits}`;
}

/** '10.000' | '$10.000' | '10000' → 10000; '' → 0; anything else throws 'Valor inválido'. */
export function parseCOPInput(text) {
  const cleaned = String(text ?? '').replace(/[\s$]/g, '');
  if (cleaned === '') return 0;
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(cleaned)) throw new Error('Valor inválido');
  return Number(cleaned.replace(/\./g, ''));
}

export function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  return `${Number(day)}/${month}/${year}`;
}

/** Today's date (yyyy-mm-dd) in Bogota, which is UTC-5 all year. */
export function todayISO(now = new Date()) {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const displayNumber = ({ number, suffix }) => (suffix ? `${number}-${suffix}` : String(number));
export const statusLabel = (status) => STATUS_LABELS[status] ?? status;
export const locationLabel = (location) => LOCATION_LABELS[location] ?? location ?? '';

/** Monday of the week containing `iso` (yyyy-mm-dd). */
export function startOfWeek(iso) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
