<script setup lang="ts">
import { onMounted } from 'vue';
import AppButton from '../shared/ui/AppButton.vue';
import AppFormActions from '../shared/ui/AppFormActions.vue';
import AppInput from '../shared/ui/AppInput.vue';
import AppNumberInput from '../shared/ui/AppNumberInput.vue';
import { useProfile } from '../features/profile/useProfile';

const profile = useProfile();
const { settingsDraft, settingsStatus, draft, apiKeyInput, credentials, status, options } = profile;

onMounted(() => {
  void profile.init();
});
</script>

<template>
  <div class="profile-view app-view is-active">
    <section class="panel">
      <div class="sec-head">
        <h2>Profile</h2>
      </div>
      <p class="muted">Manage your profile and application settings from one place. Everything stays on this device.</p>
    </section>

    <section class="panel" aria-labelledby="ai-settings-heading">
      <div class="sec-head">
        <h2 id="ai-settings-heading">AI provider</h2>
        <span class="chip" :class="{ 'chip-ok': credentials?.configured }">
          {{ credentials?.configured ? 'Configured' : 'Not configured' }}
        </span>
      </div>
      <p class="muted">
        Choose the AI provider/model and save an API key. The key is stored only in the desktop app's Rust app-data; it is never saved in Vue state, browser storage, or the web bundle.
      </p>

      <form class="diet-settings-form" @submit.prevent="profile.save">
        <div class="diet-settings-grid">
          <label class="budget-field" for="ai-provider">
            <span>Provider</span>
            <select id="ai-provider" class="budget-select" v-model="draft.provider" @change="profile.selectProvider(draft.provider)">
              <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>

          <AppInput id="ai-model" v-model="draft.model" label="Model" placeholder="e.g. gemini-3.8-flash" />
          <AppInput id="ai-endpoint" v-model="draft.endpoint" label="Endpoint" placeholder="Provider API endpoint" />
          <AppInput
            id="ai-key"
            v-model="apiKeyInput"
            label="API key"
            type="password"
            :placeholder="credentials?.apiKeyMasked ? `Saved: ${credentials.apiKeyMasked} (leave blank to keep)` : 'Paste your API key'"
            autocomplete="off"
          />
        </div>

        <p class="muted ai-note">
          <template v-if="credentials?.hasStoredKey">A key is stored in app data. Leave the key field blank to keep it.</template>
          <template v-else>No key stored yet. Diet AI generation needs a key in the desktop app.</template>
        </p>

        <AppFormActions>
          <AppButton variant="ghost" type="button" @click="profile.reset">Reset</AppButton>
          <AppButton variant="primary" size="sm" type="submit">Save AI settings</AppButton>
        </AppFormActions>
      </form>
      <p class="status" role="status">{{ status }}</p>
    </section>

    <section class="panel" aria-labelledby="diet-settings-heading">
      <div class="sec-head">
        <h2 id="diet-settings-heading">Diet settings</h2>
        <span class="chip">Shared with Diet Advisor</span>
      </div>
      <p class="muted">
        Medication and meal times, preferences, allergies and accepted cooking time. The Diet Advisor reads these here.
      </p>
      <form class="diet-settings-form" @submit.prevent="profile.saveDiet">
        <div class="diet-settings-grid">
          <AppInput id="profile-med-time" v-model="settingsDraft.medicationTime" label="Medication time" type="time" />
          <AppInput id="profile-breakfast" v-model="settingsDraft.breakfastTime" label="Breakfast time" type="time" />
          <AppInput id="profile-lunch" v-model="settingsDraft.lunchTime" label="Lunch time" type="time" />
          <AppInput id="profile-dinner" v-model="settingsDraft.dinnerTime" label="Dinner time" type="time" />
          <AppInput
            id="profile-diet"
            v-model="settingsDraft.dietPreferences"
            label="Diet preference"
            placeholder="e.g. vegetarian"
          />
          <AppInput
            id="profile-allergies"
            v-model="settingsDraft.allergies"
            label="Allergies"
            placeholder="e.g. peanuts, shellfish"
          />
          <AppInput
            id="profile-avoid"
            v-model="settingsDraft.avoidFoods"
            label="Foods to avoid"
            placeholder="e.g. coriander, pork"
          />
          <AppNumberInput
            id="profile-cook"
            v-model="settingsDraft.cookingMinutes"
            label="Cooking time I accept (minutes)"
            :min="5"
            :max="240"
            :step="5"
          />
          <AppInput
            id="profile-equipment"
            v-model="settingsDraft.equipment"
            label="Equipment"
            placeholder="e.g. oven, blender"
          />
          <AppNumberInput
            id="profile-servings"
            v-model="settingsDraft.servings"
            label="People"
            :min="1"
            :max="12"
            :step="1"
          />
          <label class="profile-checkbox" for="profile-leftovers">
            <input id="profile-leftovers" v-model="settingsDraft.leftovers" type="checkbox" />
            <span>Plan leftovers</span>
          </label>
          <AppInput
            id="profile-cuisine"
            v-model="settingsDraft.cuisinePreference"
            label="Cuisine preference"
            placeholder="e.g. Mediterranean"
          />
          <AppInput
            id="profile-shopping"
            v-model="settingsDraft.shopping"
            label="Where I shop"
            placeholder="e.g. local market"
          />
          <label class="budget-field" for="profile-budget">
            <span>Budget</span>
            <select id="profile-budget" class="budget-select" v-model="settingsDraft.budget">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <AppFormActions>
          <AppButton variant="ghost" type="button" @click="profile.resetDietSettings">Reset</AppButton>
          <AppButton variant="primary" size="sm" type="submit">Save diet settings</AppButton>
        </AppFormActions>
      </form>
      <p class="status" role="status">{{ settingsStatus }}</p>
      <p class="muted">These settings and your pantry stay on this device. Only the values needed for a plan are sent to the AI.</p>
    </section>
  </div>
</template>

<style scoped>
.diet-settings-form {
  margin-top: 12px;
}

.diet-settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.budget-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--color-charcoal);
  font-size: 13px;
  line-height: 1.4;
  font-weight: var(--font-weight-medium);
}

.budget-select {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--line) 95%, var(--color-ash));
  border-radius: var(--radius-buttons);
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--surface-2) 55%, var(--bg)) 0%,
    var(--surface) 100%);
  color: var(--ink);
  font: inherit;
  font-size: 14px;
}

.profile-checkbox {
  display: inline-flex;
  align-items: center;
  align-self: end;
  gap: 6px;
  min-height: 32px;
  color: var(--color-charcoal);
  font-size: 13px;
  font-weight: var(--font-weight-medium);
}

.ai-note { margin-top: 8px; font-size: 0.92rem; }
.chip-ok { background: color-mix(in srgb, var(--ok, #2f855a) 14%, transparent); color: var(--ok, #2f855a); }
</style>
