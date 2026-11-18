import type { Habit, MailSlot } from './types';

/** Key used for persistent browser storage. */
export const STORAGE_KEY = 'energy-planner-v1';

/** User-facing labels for energy tiers. */
export const EN_NAMES: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

/** User-facing labels for urgency/importance levels. */
export const IM_NAMES: Record<number, string> = { 1: 'Later', 2: 'This week', 3: 'Today' };

/** Descriptive hints explaining how to spend each energy tier. */
export const HINTS: Record<number, string> = {
  1: 'Low: replies, admin, tidying. Keep it light and finish small things.',
  2: 'Medium: steady, routine work. Good for drafting and preparation.',
  3: 'High: deep work. Spend it on the hardest, most important task first.'
};

/** Pre-loaded starter habits. */
export const DEFAULT_HABITS: Habit[] = [
  {
    id: 'en',
    name: 'English · IELTS',
    by: {
      1: { min: 30, txt: 'Listening: one full IELTS section (about 30 min), check answers and note paraphrases missed. Then review vocabulary.' },
      2: { min: 60, txt: 'Reading: one full passage set under time (60 min for full test), then analyse wrong answers. Add 5 phrases.' },
      3: { min: 90, txt: 'Writing Task 2 essay (250 words in 40 min), then Task 1 (150 words in 20 min). Correct yourself, then record a 2 min Speaking Part 2.' }
    }
  },
  {
    id: 'de',
    name: 'German · Goethe C1',
    by: {
      1: { min: 30, txt: 'Hören: one Goethe C1 Modelltest part, then Tagesschau or Deutschlandfunk. Write down 5 new Wendungen.' },
      2: { min: 60, txt: 'Lesen: one Modelltest part under time, then a Zeit or FAZ article summarised in 5 sentences. Practise Konnektoren.' },
      3: { min: 90, txt: 'Schreiben: one full Modelltest task (Forumsbeitrag or formelle E-Mail), then correct it. Finish with 5 min Sprechen out loud.' }
    }
  },
  {
    id: 'mail',
    name: 'Email routine',
    slots: true,
    by: {
      1: { min: 20, txt: 'Two quick checks (about 9:00 and 16:30): read, reply right away, update application tracker.' },
      2: { min: 30, txt: 'Both checks, plus write 1 outgoing email (application or recruiter) and schedule for 9:00 tomorrow.' },
      3: { min: 45, txt: 'Both checks, plus 1 or 2 carefully tailored outgoing emails. On Fridays, follow up on older applications.' }
    }
  }
];

/** Scheduled checks for the weekday email routine. */
export const MAIL_SLOTS: MailSlot[] = [
  { id: 'c1', time: '09:00', label: 'Check 1: read, reply, send drafted mails' },
  { id: 'w', time: '09:15', label: 'Write 1 outgoing email (application, recruiter or former colleague)' },
  { id: 'f', time: '09:25', label: 'Follow up on applications from 5 to 7 days ago', fri: true },
  { id: 'c2', time: '16:30', label: 'Check 2: reply, draft tomorrow’s mails, schedule them for 9:00' }
];
