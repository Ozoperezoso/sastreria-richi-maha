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

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const utcDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);

/** Whole days from `fromIso` to `toIso` (both yyyy-mm-dd); negative when `toIso` is earlier. */
export function daysBetween(fromIso, toIso) {
  return Math.round((utcDate(toIso) - utcDate(fromIso)) / 86_400_000);
}

/** 'lun', 'mar', 'mié'… for the tape measure. */
export const weekdayShort = (iso) => WEEKDAYS_SHORT[utcDate(iso).getUTCDay()];

/** 'lunes 2 de noviembre'. */
export function longDate(iso) {
  const date = utcDate(iso);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * The tape-measure mark for a ticket: days until the promised date (negative when late),
 * or days waiting on the shelf. `{ mark: '−5', unit: 'días' }`, `{ mark: 'Hoy', unit: '' }`.
 */
export function tapeMark(days, { future = 'weekday', iso = null } = {}) {
  if (days === null || days === undefined) return { mark: '—', unit: 'sin fecha' };
  if (days === 0) return { mark: 'Hoy', unit: '' };
  const plural = Math.abs(days) === 1 ? 'día' : 'días';
  if (days < 0) return { mark: `−${-days}`, unit: plural };
  if (future === 'weekday' && iso) return { mark: `+${days}`, unit: weekdayShort(iso) };
  return { mark: String(days), unit: plural };
}

/** Late for longer than this, or ready on the shelf for longer: probably handled but never recorded. */
export const STALE_DAYS = 30;

/**
 * When a ready ticket reached the shelf. The sheet never recorded it, so for imported tickets
 * (legacy row present) the promised date stands in; otherwise the last change.
 */
export function readySince(ticket) {
  if (ticket.legacy) return String(ticket.due_on ?? ticket.received_on).slice(0, 10);
  return String(ticket.updated_at).slice(0, 10);
}

/** Old backlog that goes to "Por revisar" instead of the daily queue. */
export function isStale(ticket, today = todayISO()) {
  if (ticket.status === 'listo') return daysBetween(readySince(ticket), today) > STALE_DAYS;
  if (ticket.status === 'recibido' || ticket.status === 'en_proceso') {
    return Boolean(ticket.due_on) && daysBetween(ticket.due_on, today) > STALE_DAYS;
  }
  return false;
}

/** The promised date in words: 'Se entrega hoy', 'Atrasado 5 días', 'Se entrega en 4 días, viernes 6 de noviembre'. */
export function dueText(dueIso, today = todayISO()) {
  if (!dueIso) return 'Sin fecha de entrega';
  const days = daysBetween(today, dueIso);
  if (days === 0) return 'Se entrega hoy';
  if (days < 0) return `Atrasado ${-days} ${days === -1 ? 'día' : 'días'}`;
  if (days === 1) return 'Se entrega mañana';
  return `Se entrega en ${days} días, ${longDate(dueIso)}`;
}

/** How long ago, in Bogotá calendar days: 'hoy', 'ayer', 'hace 3 días', 'hace 2 meses'; null → 'Sin uso'. */
export function relativeDays(value, today = new Date()) {
  if (!value) return 'Sin uso';
  const days = daysBetween(todayISO(new Date(value)), todayISO(today));
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}
