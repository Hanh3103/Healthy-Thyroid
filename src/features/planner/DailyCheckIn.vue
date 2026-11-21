<script setup lang="ts">
import { computed } from 'vue';
import { usePlanner } from './usePlanner';
import EnergyPicker from './EnergyPicker.vue';
import AppButton from '../../shared/ui/AppButton.vue';
import AppFormActions from '../../shared/ui/AppFormActions.vue';
import { EN_NAMES } from './model';
import { parseSymptomChips } from './checkin';

const planner = usePlanner();
const {
  checkIn,
  checkInLocked,
  checkInForm,
  nowTasks,
  deferredTaskCount,
  energyHint,
} = planner;

const suggestionLabel = computed(() => (
  checkInForm.value.suggestion === null
    ? ''
    : EN_NAMES[checkInForm.value.suggestion]
));

const savedLevel = computed(() => checkIn.value?.level ?? 2);
const savedLabel = computed(() => EN_NAMES[savedLevel.value]);
const symptomChips = computed(() => parseSymptomChips(checkIn.value?.symptoms ?? ''));

const savedTimeLabel = computed(() => {
  const at = checkIn.value?.at;
  if (!at) return 'Saved';
  const time = new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Saved ${time}`;
});

const footerText = computed(() => {
  const count = nowTasks.value.length;
  const word = count === 1 ? 'task' : 'tasks';
  if (savedLevel.value === 3) return `${count} ${word} queued. Tackle the hardest first.`;
  if (savedLevel.value === 2) return `${count} ${word} queued. Keep a steady pace.`;
  return `${count} light ${word} queued. Keep it gentle.`;
});

function focusToday(): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('h-now')?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}
</script>

<template>
  <section
    class="panel daily-checkin"
    :class="{ 'is-saved': checkInLocked }"
    :data-level="checkInLocked && checkIn ? checkIn.level : undefined"
    aria-labelledby="h-checkin"
  >
    <div class="checkin-header">
      <h2 id="h-checkin">Daily check-in</h2>
      <div class="header-actions">
        <span v-if="checkInLocked" class="saved-pill">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 8.2 3 3 6-6.4" />
          </svg>
          {{ savedTimeLabel }}
        </span>
        <AppButton
          v-if="checkInLocked"
          class="edit-checkin"
          variant="ghost"
          size="sm"
          @click="planner.editCheckIn"
        >
          <svg class="pencil-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11.2 2.3a1.4 1.4 0 0 1 2 2L6 11.5l-2.7.8.8-2.7 7.1-7.3Z" />
            <path d="M3 14h10" />
          </svg>
          <span>Edit check-in</span>
        </AppButton>
      </div>
    </div>

    <div v-if="checkInLocked && checkIn" class="checkin-summary">
      <div class="saved-hero">
        <div class="saved-battery" aria-hidden="true">
          <i v-for="cell in 3" :key="cell" :class="{ 'is-filled': cell <= checkIn.level }"></i>
        </div>
        <div class="hero-copy">
          <strong class="saved-level">{{ savedLabel }}</strong>
          <p class="locked-line">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.4" />
              <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
            </svg>
            Locked for today, resets at midnight
          </p>
        </div>
      </div>

      <div class="saved-symptoms" aria-label="Symptoms logged">
        <template v-if="symptomChips.length">
          <span v-for="(chip, index) in symptomChips" :key="`${chip}-${index}`" class="symptom-chip">{{ chip }}</span>
        </template>
        <span v-else class="symptom-empty">No symptoms logged</span>
      </div>

      <blockquote v-if="checkIn.aiReason" class="ai-reason">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5 9.4 5.2 13 6.6 9.4 8 8 11.7 6.6 8 3 6.6 6.6 5.2 8 1.5Z" />
          <path d="M12.8 11.2 13.4 12.8 15 13.4 13.4 14 12.8 15.6 12.2 14 10.6 13.4 12.2 12.8 12.8 11.2Z" />
        </svg>
        <p>Suggested by AI: {{ checkIn.aiReason }}</p>
      </blockquote>

      <button type="button" class="saved-footer" @click="focusToday">
        <span>{{ footerText }}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h9" />
          <path d="m8.5 4 4 4-4 4" />
        </svg>
      </button>
    </div>

    <form v-else class="checkin-form" @submit.prevent="planner.saveCheckIn">
      <label class="checkin-label" for="checkin-symptoms">How do you feel today?</label>
      <textarea
        id="checkin-symptoms"
        v-model="checkInForm.symptoms"
        class="checkin-input"
        rows="3"
        maxlength="1000"
        placeholder="Sleep, pain, focus, stress, anything relevant…"
        :disabled="checkInForm.loading"
      ></textarea>

      <div class="checkin-actions">
        <AppButton
          variant="ghost"
          size="sm"
          :loading="checkInForm.loading"
          :disabled="!checkInForm.symptoms.trim() || checkInForm.loading"
          @click="planner.suggestCheckInEnergy"
        >Suggest energy</AppButton>
      </div>

      <div v-if="checkInForm.suggestion !== null" class="checkin-suggestion" role="status">
        <span>AI suggests <strong>{{ suggestionLabel }}</strong></span>
        <button type="button" class="accept-suggestion" @click="planner.acceptCheckInSuggestion">
          Accept
        </button>
      </div>

      <fieldset class="checkin-energy">
        <legend id="checkin-energy-label">My energy level</legend>
        <EnergyPicker
          :model-value="checkInForm.level"
          aria-labelledby="checkin-energy-label"
          @update:model-value="(level) => checkInForm.level = level"
        />
      </fieldset>

      <p v-if="deferredTaskCount" class="muted">
        {{ deferredTaskCount }} high-focus task{{ deferredTaskCount === 1 ? '' : 's' }} will be parked at this level.
      </p>
      <p class="muted checkin-status" role="status">{{ checkInForm.status }}</p>

      <AppFormActions class="checkin-form-actions">
        <AppButton variant="ghost" size="sm" type="button" :equal="true" @click="planner.cancelCheckInEdit">Cancel</AppButton>
        <AppButton variant="primary" size="sm" type="submit" :equal="true">Save</AppButton>
      </AppFormActions>

      <p class="muted energy-hint" id="energy-hint">{{ energyHint }}</p>
    </form>
  </section>
</template>

<style scoped>
.daily-checkin {
  font-family: Inter, var(--font-geist-sans), system-ui, sans-serif;
}

.daily-checkin.is-saved {
  padding: 22px;
  border: 1px solid color-mix(in srgb, var(--saved-color) 45%, transparent);
  border-radius: 22px;
  background: var(--saved-tint);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 55%, transparent),
    0 12px 28px color-mix(in srgb, var(--saved-color) 12%, transparent);
}

.daily-checkin[data-level="1"] {
  --saved-color: #b45309;
  --saved-muted: #6b3d06;
  --saved-tint: #fffbeb;
  --saved-soft: #fef3c7;
}

.daily-checkin[data-level="2"] {
  --saved-color: #0f766e;
  --saved-muted: #0b5f59;
  --saved-tint: #f0fdfa;
  --saved-soft: #ccfbf1;
}

.daily-checkin[data-level="3"] {
  --saved-color: #15803d;
  --saved-muted: #14532d;
  --saved-tint: #f0fdf4;
  --saved-soft: #dcfce7;
}

@media (prefers-color-scheme: dark) {
  .daily-checkin[data-level="1"] {
    --saved-color: #fbbf24;
    --saved-muted: #fde68a;
    --saved-tint: #2b1a06;
    --saved-soft: #3b2508;
  }

  .daily-checkin[data-level="2"] {
    --saved-color: #2dd4bf;
    --saved-muted: #99f6e4;
    --saved-tint: #052e2b;
    --saved-soft: #064e3b;
  }

  .daily-checkin[data-level="3"] {
    --saved-color: #4ade80;
    --saved-muted: #bbf7d0;
    --saved-tint: #072714;
    --saved-soft: #0f3d22;
  }
}

:root[data-theme="dark"] .daily-checkin[data-level="1"] {
  --saved-color: #fbbf24;
  --saved-muted: #fde68a;
  --saved-tint: #2b1a06;
  --saved-soft: #3b2508;
}

:root[data-theme="dark"] .daily-checkin[data-level="2"] {
  --saved-color: #2dd4bf;
  --saved-muted: #99f6e4;
  --saved-tint: #052e2b;
  --saved-soft: #064e3b;
}

:root[data-theme="dark"] .daily-checkin[data-level="3"] {
  --saved-color: #4ade80;
  --saved-muted: #bbf7d0;
  --saved-tint: #072714;
  --saved-soft: #0f3d22;
}

.checkin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.checkin-header h2 {
  margin: 0;
  color: var(--saved-muted, var(--ink-2));
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
  line-height: 1.2;
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.saved-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid color-mix(in srgb, var(--saved-color) 30%, transparent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--saved-color) 14%, var(--saved-tint));
  color: var(--saved-color);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  animation: pill-in 320ms ease both;
}

.saved-pill svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.edit-checkin {
  height: 28px;
  padding: 0 8px;
  font-size: 11px;
}

.pencil-icon {
  width: 12px;
  height: 12px;
  margin-right: 4px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.checkin-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 20px;
}

.saved-hero {
  display: flex;
  align-items: center;
  gap: 16px;
}

.saved-battery {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: 4px;
  width: 56px;
  height: 30px;
  padding: 4px;
  box-sizing: border-box;
  border: 2px solid var(--saved-color);
  border-radius: 6px;
  flex: 0 0 auto;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--saved-color) 22%, transparent),
    0 0 18px color-mix(in srgb, var(--saved-color) 34%, transparent);
}

.saved-battery::after {
  content: "";
  position: absolute;
  right: -6px;
  top: 50%;
  width: 4px;
  height: 10px;
  border-radius: 0 2px 2px 0;
  background: var(--saved-color);
  transform: translateY(-50%);
}

.saved-battery i {
  display: block;
  border-radius: 2px;
  background: color-mix(in srgb, var(--saved-color) 10%, transparent);
}

.saved-battery i.is-filled {
  background: var(--saved-color);
  box-shadow: 0 0 8px color-mix(in srgb, var(--saved-color) 55%, transparent);
  animation: cell-fill 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.saved-battery i:nth-child(1).is-filled { animation-delay: 0ms; }
.saved-battery i:nth-child(2).is-filled { animation-delay: 70ms; }
.saved-battery i:nth-child(3).is-filled { animation-delay: 140ms; }

.hero-copy {
  min-width: 0;
}

.saved-level {
  display: block;
  color: var(--saved-color);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}

.locked-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  color: var(--saved-muted);
  font-size: 12px;
  line-height: 1.3;
}

.locked-line svg {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.saved-symptoms {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.symptom-chip {
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--saved-color) 28%, transparent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--saved-color) 8%, var(--saved-tint));
  color: var(--ink);
  font-size: 12px;
  font-weight: var(--font-weight-medium);
}

.symptom-empty {
  color: var(--saved-muted);
  font-size: 12px;
  font-style: italic;
}

.ai-reason {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-left: 2px solid color-mix(in srgb, var(--saved-color) 55%, transparent);
  border-radius: 0 10px 10px 0;
  background: color-mix(in srgb, var(--saved-color) 6%, var(--saved-tint));
  color: var(--saved-muted);
  font-size: 12px;
  line-height: 1.4;
}

.ai-reason svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  margin-top: 1px;
  fill: var(--saved-color);
  stroke: var(--saved-color);
  stroke-width: 0.7;
  stroke-linejoin: round;
}

.ai-reason p {
  margin: 0;
}

.saved-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: calc(100% + 44px);
  margin: 4px -22px -22px;
  padding: 14px 22px;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--saved-color) 25%, transparent);
  border-radius: 0 0 21px 21px;
  background: color-mix(in srgb, var(--saved-color) 13%, var(--saved-soft));
  color: var(--ink);
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  text-align: left;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.15s ease;
}

.saved-footer:hover {
  filter: brightness(1.04);
}

.saved-footer:focus-visible {
  outline: 2px solid var(--saved-color);
  outline-offset: -3px;
}

.saved-footer:active {
  transform: translateY(1px);
}

.saved-footer svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--saved-color);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@keyframes cell-fill {
  from {
    background: color-mix(in srgb, var(--saved-color) 10%, transparent);
    box-shadow: none;
  }
  to {
    background: var(--saved-color);
    box-shadow: 0 0 8px color-mix(in srgb, var(--saved-color) 55%, transparent);
  }
}

@keyframes pill-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.checkin-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10, 10px);
}

.checkin-label,
.checkin-energy legend {
  color: var(--ink-2);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
}

.checkin-energy {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.checkin-energy legend {
  margin-bottom: 6px;
  padding: 0;
}

.checkin-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--line) 90%, var(--ink-2));
  border-radius: var(--radius-buttons);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--text-caption);
  line-height: 1.4;
  resize: vertical;
}

.checkin-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.checkin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkin-form-actions {
  justify-content: flex-end;
}

.checkin-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  border-radius: var(--radius-buttons);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--ink-2);
  font-size: var(--text-caption);
}

.checkin-suggestion strong {
  color: var(--ink);
}

.accept-suggestion {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  text-decoration: underline;
  cursor: pointer;
}

.checkin-status {
  min-height: 1em;
}

.energy-hint {
  margin-top: 8px;
  font-size: var(--text-caption);
}

@media (prefers-reduced-motion: reduce) {
  .saved-battery i.is-filled,
  .saved-pill {
    animation: none;
  }

  .saved-footer {
    transition: none;
  }
}
</style>
