import type { ThyroidAppointment } from '../domain/types';
import { state } from './state';
import { setFormStatus } from './helpers';
import { uid } from '../../../shared/utils';
import {
  daysBetween,
  dmyToIso,
  formatDateDMY,
  formatAppointmentDate,
  nextTargetDate,
  suggestedAppointmentDate,
  todayIso,
} from '../domain/appointments';
import { appointmentRepository } from '../data/appointment-repository';

function refreshAppointmentCard(): void {
  const targetDate = nextTargetDate(state.appointments, suggestedAppointmentDate(state.records, state.appointmentFrequency ?? 2));
  const days = daysBetween(todayIso(), targetDate);
  const card = document.getElementById('thyroid-appointment-card');
  if (!card) return;

  const dateEl = card.querySelector<HTMLElement>('[data-appt-date]');
  const countdownEl = card.querySelector<HTMLElement>('[data-appt-countdown]');
  const statusEl = card.querySelector<HTMLElement>('[data-appt-status]');

  if (dateEl) dateEl.textContent = formatAppointmentDate(targetDate);
  if (countdownEl) {
    if (days === 0) countdownEl.textContent = 'today';
    else if (days > 0) countdownEl.textContent = `in ${days} day${days === 1 ? '' : 's'}`;
    else countdownEl.textContent = `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  }

  const dueSoon = days <= 7;
  const overdue = days < 0;
  card.classList.toggle('thyroid-appt-due', dueSoon);
  card.classList.toggle('thyroid-appt-overdue', overdue);

  if (statusEl) {
    if (overdue) statusEl.textContent = 'Overdue — book an appointment';
    else if (days <= 7) statusEl.textContent = 'Due soon';
    else statusEl.textContent = 'On track';
  }

  const hasUpcoming = state.appointments.some((appointment) => !appointment.completed && appointment.date >= todayIso());
  const addBtn = document.getElementById('thyroid-appt-add-btn');
  if (addBtn) addBtn.textContent = hasUpcoming ? 'Change appointment' : 'Add appointment';

  const banner = document.getElementById('thyroid-appt-banner');
  if (banner) {
    if (overdue || days <= 7) {
      banner.hidden = false;
      banner.textContent = overdue
        ? `Blood control overdue (${formatAppointmentDate(targetDate)}). Please book an appointment.`
        : `Blood control due ${formatAppointmentDate(targetDate)}.`;
    } else {
      banner.hidden = true;
    }
  }
}

function openAppointmentModal(prefillDate?: string): void {
  const dialog = document.getElementById('thyroid-appt-dialog') as HTMLDialogElement | null;
  if (!dialog) return;
  const dateInput = document.getElementById('thyroid-appt-date') as HTMLInputElement | null;
  const timeInput = document.getElementById('thyroid-appt-time') as HTMLInputElement | null;
  const noteInput = document.getElementById('thyroid-appt-note') as HTMLInputElement | null;
  if (dateInput) dateInput.value = prefillDate ? formatDateDMY(prefillDate) : formatDateDMY(suggestedAppointmentDate(state.records, state.appointmentFrequency ?? 2));
  if (timeInput) timeInput.value = '';
  if (noteInput) noteInput.value = '';
  const suggestedEl = document.getElementById('thyroid-appt-suggested');
  if (suggestedEl) suggestedEl.textContent = formatDateDMY(suggestedAppointmentDate(state.records, state.appointmentFrequency ?? 2));
  dialog.showModal();
}

function closeAppointmentModal(): void {
  (document.getElementById('thyroid-appt-dialog') as HTMLDialogElement | null)?.close();
}

function saveAppointment(): void {
  const dateInput = document.getElementById('thyroid-appt-date') as HTMLInputElement | null;
  const timeInput = document.getElementById('thyroid-appt-time') as HTMLInputElement | null;
  const noteInput = document.getElementById('thyroid-appt-note') as HTMLInputElement | null;
  const date = dateInput?.value ? dmyToIso(dateInput.value) : null;
  if (!date) return;
  const appointment: ThyroidAppointment = {
    id: uid(),
    date,
    time: timeInput?.value || undefined,
    note: noteInput?.value.trim() || undefined,
    createdAt: Date.now(),
  };
  // Replace any existing upcoming appointment instead of duplicating.
  state.appointments = state.appointments.filter((a) => a.completed || a.date < todayIso()).concat(appointment);
  appointmentRepository.save(state.appointments);
  closeAppointmentModal();
  refreshAppointmentCard();
  setFormStatus(`Appointment saved for ${formatAppointmentDate(date)}.`);
}

function openFrequencyModal(): void {
  const dialog = document.getElementById('thyroid-freq-dialog') as HTMLDialogElement | null;
  if (!dialog) return;
  const input = document.getElementById('thyroid-freq-input') as HTMLInputElement | null;
  if (input) input.value = String(state.appointmentFrequency ?? 2);
  dialog.showModal();
}

function closeFrequencyModal(): void {
  (document.getElementById('thyroid-freq-dialog') as HTMLDialogElement | null)?.close();
}

function saveFrequency(): void {
  const input = document.getElementById('thyroid-freq-input') as HTMLInputElement | null;
  const value = Number(input?.value);
  if (!Number.isFinite(value) || value <= 0) return;
  state.appointmentFrequency = value;
  appointmentRepository.saveFrequency(value);
  closeFrequencyModal();
  refreshAppointmentCard();
}

function runFirstRunPromptIfNeeded(): void {
  if (appointmentRepository.isFirstRunDone()) return;
  if (state.appointmentFrequency !== null) {
    appointmentRepository.markFirstRunDone();
    return;
  }
  const dialog = document.getElementById('thyroid-first-run-dialog') as HTMLDialogElement | null;
  if (!dialog) return;
  dialog.showModal();
}

function submitFirstRun(): void {
  const freqInput = document.querySelector<HTMLInputElement>('input[name="thyroid-freq-choice"]:checked');
  const value = Number(freqInput?.value ?? 2);
  state.appointmentFrequency = Number.isFinite(value) && value > 0 ? value : 2;
  appointmentRepository.saveFrequency(state.appointmentFrequency);
  appointmentRepository.markFirstRunDone();
  (document.getElementById('thyroid-first-run-dialog') as HTMLDialogElement | null)?.close();

  const hasAppt = document.querySelector<HTMLInputElement>('input[name="thyroid-has-appt"]:checked')?.value === 'yes';
  const suggested = suggestedAppointmentDate(state.records, state.appointmentFrequency);
  if (hasAppt) {
    openAppointmentModal(suggested);
  } else {
    const banner = document.getElementById('thyroid-appt-banner');
    if (banner) {
      banner.hidden = false;
      banner.textContent = `Please book a blood control appointment around ${formatAppointmentDate(suggested)}.`;
    }
  }
  refreshAppointmentCard();
}


export { refreshAppointmentCard, openAppointmentModal, closeAppointmentModal, saveAppointment, openFrequencyModal, closeFrequencyModal, saveFrequency, runFirstRunPromptIfNeeded, submitFirstRun };
