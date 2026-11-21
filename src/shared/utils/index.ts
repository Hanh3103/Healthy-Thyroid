/**
 * Utility functions for string escaping, DOM selection, date calculations, and UID generation.
 */

/** Formats a number with leading zero if single digit. */
export function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** Returns a standardized date key string (YYYY-MM-DD) from a Date instance in local time. */
export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Escapes HTML special characters in strings to prevent XSS in DOM templates. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

/** Generates a unique pseudo-random ID string. */
export function uid(): string {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Type-safe DOM query selector that retrieves elements by ID and throws if missing. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id #${id} not found`);
  return el as T;
}

/** Calculates calendar days difference between today and a target due date string. */
export function daysUntil(due: string, now = new Date()): number | null {
  if (!due) return null;
  const p = due.split('-');
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

/** Formats a due date into a human-friendly badge label and determines if it is late. */
export function dueLabel(due: string): { t: string; late: boolean } | null {
  const n = daysUntil(due);
  if (n === null) return null;
  if (n < 0) return { t: 'Overdue', late: true };
  if (n === 0) return { t: 'Due today', late: true };
  if (n === 1) return { t: 'Due tomorrow', late: false };
  const p = due.split('-');
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  return { t: 'Due ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), late: false };
}

/**
 * Parses a user-typed due date in `DD/MM/YY` or `DD/MM/YYYY` format and returns
 * an ISO date (`YYYY-MM-DD`). Returns `''` for empty or invalid input.
 */
export function parseDueInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearRaw = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + yearRaw : yearRaw;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return '';
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Formats an ISO date (`YYYY-MM-DD`) as a short `DD/MM/YY` string. */
export function formatIsoToDmyShort(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  return `${d}/${m}/${String(y).slice(-2)}`;
}

/**
 * Returns an array of Date instances for the past 7 days up to today,
 * normalized to 12:00:00 (midday) to prevent daylight saving time / hour drift bugs.
 */
export function getPast7Days(now = new Date()): Date[] {
  const list: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    list.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12, 0, 0));
  }
  return list;
}
