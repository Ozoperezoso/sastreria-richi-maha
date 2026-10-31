// Value parsers for the Google Sheet export (Colombian formats).

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const pad = (n) => String(n).padStart(2, '0');

function matchDate(value) {
  const m = DATE_RE.exec(String(value ?? '').trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { date: `${year}-${pad(month)}-${pad(day)}`, h: m[4], min: m[5], s: m[6] };
}

// Google Sheets sometimes exports a date cell as its serial number (days since 1899-12-30).
const SERIAL_RE = /^\d{5}$/;
const SERIAL_MIN = 36526; // 2000-01-01
const SERIAL_MAX = 54789; // 2049-12-31

function serialToDate(value) {
  const text = String(value ?? '').trim();
  if (!SERIAL_RE.test(text)) return null;
  const serial = Number(text);
  if (serial < SERIAL_MIN || serial > SERIAL_MAX) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}

/** 'd/mm/yyyy', 'd/mm/yyyy h:mm:ss' or a Sheets serial → 'yyyy-mm-dd', or null when blank/invalid. */
export function parseDate(value) {
  return matchDate(value)?.date ?? serialToDate(value);
}

/** 'd/mm/yyyy h:mm:ss' → ISO timestamp in Bogota time (UTC-5, no DST), or null. */
export function parseTimestamp(value) {
  const m = matchDate(value);
  if (!m) return null;
  const time = m.h === undefined ? '00:00:00' : `${pad(m.h)}:${m.min}:${pad(m.s ?? 0)}`;
  return `${m.date}T${time}-05:00`;
}

/** ' $24.000' → 24000, '- $6.000' → -6000, blank → null. Pesos have no decimals. */
export function parseMoney(value) {
  const text = String(value ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (digits === '') return null;
  const amount = Number(digits);
  return text.startsWith('-') ? -amount : amount;
}

export function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Digits only; drops a leading 57 country code from 12-digit numbers. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
}
