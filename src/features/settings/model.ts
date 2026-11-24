/**
 * Settings that are shared by the whole application.
 *
 * These preferences are local to the device. The API key is deliberately not
 * part of this model: it lives only in the OS keychain and is managed by the AI
 * settings section.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type LanguageCode = 'en-GB' | 'en-US' | 'de-DE' | 'fr-FR' | 'es-ES';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'D MMM YYYY';
export type TimeFormat = '24h' | '12h';
export type WeekStart = 0 | 1;

export interface GeneralPreferences {
  theme: ThemeMode;
  language: LanguageCode;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: WeekStart;
}

export const DEFAULT_PREFERENCES: GeneralPreferences = {
  theme: 'system',
  language: 'en-GB',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  weekStartsOn: 1,
};

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export const LANGUAGE_OPTIONS: Array<{ value: LanguageCode; label: string }> = [
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'es-ES', label: 'Español' },
];

export const DATE_FORMAT_OPTIONS: Array<{ value: DateFormat; label: string }> = [
  { value: 'DD/MM/YYYY', label: '24/11/2026' },
  { value: 'MM/DD/YYYY', label: '11/24/2026' },
  { value: 'YYYY-MM-DD', label: '2026-11-24' },
  { value: 'D MMM YYYY', label: '24 Nov 2026' },
];

export const TIME_FORMAT_OPTIONS: Array<{ value: TimeFormat; label: string }> = [
  { value: '24h', label: '24-hour (18:30)' },
  { value: '12h', label: '12-hour (6:30 pm)' },
];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

/** Coerces stored preferences into safe values without throwing on old data. */
export function normalizePreferences(value: unknown): GeneralPreferences {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    theme: oneOf(raw.theme, ['light', 'dark', 'system'] as const, DEFAULT_PREFERENCES.theme),
    language: oneOf(
      raw.language,
      LANGUAGE_OPTIONS.map((option) => option.value),
      DEFAULT_PREFERENCES.language,
    ),
    dateFormat: oneOf(
      raw.dateFormat,
      DATE_FORMAT_OPTIONS.map((option) => option.value),
      DEFAULT_PREFERENCES.dateFormat,
    ),
    timeFormat: oneOf(raw.timeFormat, ['24h', '12h'] as const, DEFAULT_PREFERENCES.timeFormat),
    weekStartsOn: raw.weekStartsOn === 0 ? 0 : 1,
  };
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Formats a date using the one language/format chosen for the whole screen. */
export function formatDate(date: Date, preferences: GeneralPreferences): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  switch (preferences.dateFormat) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'D MMM YYYY':
      return date.toLocaleDateString(preferences.language, {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    default: return `${day}/${month}/${year}`;
  }
}

/** Formats a time using the chosen 12h/24h setting. */
export function formatTime(date: Date, preferences: GeneralPreferences): string {
  return date.toLocaleTimeString(preferences.language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: preferences.timeFormat === '12h',
  });
}

/** Offset from the start of the week, honouring the Sunday/Monday preference. */
export function weekStartOffset(date: Date, preferences: GeneralPreferences): number {
  return preferences.weekStartsOn === 0 ? date.getDay() : (date.getDay() + 6) % 7;
}
