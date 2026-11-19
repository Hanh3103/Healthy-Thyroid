import type { ThyroidAppointment } from './types';
import type { ThyroidBloodRecord } from './types';

/** Adds `months` months to an ISO date string, clamping day to the last day of the target month. */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const base = new Date(year, month - 1, day);
  const targetMonth = base.getMonth() + months;
  const targetYear = base.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  const result = new Date(targetYear, normalizedMonth, clampedDay);
  return toIsoDate(result);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00').getTime();
  const to = new Date(toIso + 'T00:00:00').getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

export function lastResultDate(records: ThyroidBloodRecord[]): string | null {
  if (records.length === 0) return null;
  return records.reduce((latest, record) => (record.date > latest ? record.date : latest), records[0].date);
}

export function suggestedAppointmentDate(records: ThyroidBloodRecord[], frequencyPerYear: number): string {
  const baseline = lastResultDate(records) ?? todayIso();
  const intervalMonths = Math.max(1, Math.round(12 / frequencyPerYear));
  return addMonths(baseline, intervalMonths);
}

export function nextTargetDate(appointments: ThyroidAppointment[], suggested: string): string {
  const future = appointments
    .filter((appointment) => !appointment.completed && appointment.date >= todayIso())
    .map((appointment) => appointment.date)
    .sort();
  return future.length > 0 ? future[0] : suggested;
}

export function formatDateDMY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function dmyToIso(dmy: string): string | null {
  const match = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatAppointmentDate(iso: string): string {
  return formatDateDMY(iso);
}
