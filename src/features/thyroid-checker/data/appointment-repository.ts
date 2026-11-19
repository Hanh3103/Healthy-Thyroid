import type { ThyroidAppointment } from '../domain/types';

const STORAGE_KEY = 'thyroid-appointments-v1';
const FREQUENCY_KEY = 'thyroid-blood-control-frequency-v1';
const FIRST_RUN_KEY = 'thyroid-appointment-first-run-done-v1';

export class LocalAppointmentRepository {
  load(): ThyroidAppointment[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => normalizeAppointment(item))
        .filter((item): item is ThyroidAppointment => item !== null);
    } catch {
      return [];
    }
  }

  save(appointments: ThyroidAppointment[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  }

  loadFrequency(): number | null {
    const raw = localStorage.getItem(FREQUENCY_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  saveFrequency(value: number): void {
    localStorage.setItem(FREQUENCY_KEY, String(value));
  }

  isFirstRunDone(): boolean {
    return localStorage.getItem(FIRST_RUN_KEY) === '1';
  }

  markFirstRunDone(): void {
    localStorage.setItem(FIRST_RUN_KEY, '1');
  }
}

function normalizeAppointment(item: unknown): ThyroidAppointment | null {
  if (!item || typeof item !== 'object') return null;
  const candidate = item as Partial<ThyroidAppointment>;
  if (typeof candidate.id !== 'string' || typeof candidate.date !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) return null;
  return {
    id: candidate.id,
    date: candidate.date,
    time: typeof candidate.time === 'string' ? candidate.time : undefined,
    note: typeof candidate.note === 'string' ? candidate.note : undefined,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    completed: candidate.completed === true,
  };
}

export const appointmentRepository = new LocalAppointmentRepository();
