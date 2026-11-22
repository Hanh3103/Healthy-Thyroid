<script setup lang="ts">
import { onMounted } from 'vue';
import AppButton from '../shared/ui/AppButton.vue';
import AppFormActions from '../shared/ui/AppFormActions.vue';
import AppInput from '../shared/ui/AppInput.vue';
import AppNumberInput from '../shared/ui/AppNumberInput.vue';
import { useProfile } from '../features/profile/useProfile';

const profile = useProfile();
const { draft, status, complete, providerLabel, options, settingsDraft, settingsStatus } = profile;

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

    <section class="panel">
      <div class="sec-head">
        <h2>AI Settings</h2>
        <span class="chip" :class="complete ? '' : 'todo'">{{ complete ? 'Configured' : 'Incomplete' }}</span>
      </div>
      <form @submit.prevent="profile.save">
        <label for="ai-provider-input">AI provider
          <select id="ai-provider-input" v-model="draft.provider" @change="profile.selectProvider(draft.provider)">
            <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label for="ai-api-key-input">AI API Key
          <input
            id="ai-api-key-input"
            v-model="draft.apiKey"
            type="password"
            placeholder="API key (not needed for Ollama)"
            autocomplete="off"
          />
        </label>
        <label for="ai-endpoint-input">AI endpoint
          <input
            id="ai-endpoint-input"
            v-model="draft.endpoint"
            type="url"
            placeholder="https://api.example.com/v1/chat/completions"
            autocomplete="off"
          />
        </label>
        <label for="ai-model-input">Model
          <input
            id="ai-model-input"
            v-model="draft.model"
            type="text"
            placeholder="model-name"
            autocomplete="off"
          />
        </label>
        <AppFormActions>
          <AppButton variant="ghost" type="button" @click="profile.reset">Reset</AppButton>
          <AppButton variant="primary" size="sm" type="submit">Save Settings</AppButton>
        </AppFormActions>
      </form>
      <p class="status" role="status">{{ status }}</p>
      <p class="muted">Current provider: {{ providerLabel }}. Settings are stored on this machine and shared with the Planner.</p>
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
          <AppInput id="profile-diet" v-model="settingsDraft.diet" label="Diet preference" placeholder="e.g. vegetarian" />
          <AppInput
            id="profile-avoid"
            v-model="settingsDraft.avoid"
            label="Allergies / foods to avoid"
            placeholder="e.g. peanuts, shellfish"
          />
          <AppNumberInput
            id="profile-cook"
            v-model="settingsDraft.maxCookMinutes"
            label="Cooking time I accept (minutes)"
            :min="5"
            :max="240"
            :step="5"
          />
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
</style>
