<script setup lang="ts">
import { onMounted } from 'vue';
import AppButton from '../shared/ui/AppButton.vue';
import AppFormActions from '../shared/ui/AppFormActions.vue';
import AppInput from '../shared/ui/AppInput.vue';
import AppNumberInput from '../shared/ui/AppNumberInput.vue';
import { useProfile } from '../features/profile/useProfile';

const profile = useProfile();
const { settingsDraft, settingsStatus } = profile;

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
      <p class="muted">Manage your diet preferences here. Application settings live in <RouterLink to="/settings">Settings</RouterLink>. Everything stays on this device.</p>
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

</style>
