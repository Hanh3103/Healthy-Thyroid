<script setup lang="ts">
import { onMounted } from 'vue';
import AppButton from '../shared/ui/AppButton.vue';
import { useProfile } from '../features/profile/useProfile';

const profile = useProfile();
const { draft, status, complete, providerLabel, options } = profile;

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
      <p class="muted">Manage your profile and application settings from one place.</p>
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
        <div class="actions" style="margin-top: 18px; justify-content: flex-end;">
          <AppButton variant="ghost" type="button" @click="profile.reset">Reset</AppButton>
          <AppButton variant="primary" size="sm" type="submit">Save Settings</AppButton>
        </div>
      </form>
      <p class="status" role="status">{{ status }}</p>
      <p class="muted">Current provider: {{ providerLabel }}. Settings are stored on this machine and shared with the Planner.</p>
    </section>
  </div>
</template>
