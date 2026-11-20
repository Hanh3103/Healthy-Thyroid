import { AI_ENDPOINTS, getAIConfig } from '../shared/ai/ai-client';

type AIProviderKey = keyof typeof AI_ENDPOINTS | 'custom';

function populateSettingsForm(): void {
  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  if (!form) return;

  const providerInput = document.getElementById('ai-provider-input') as HTMLSelectElement | null;
  const keyInput = document.getElementById('ai-api-key-input') as HTMLInputElement | null;
  const endpointInput = document.getElementById('ai-endpoint-input') as HTMLInputElement | null;
  const modelInput = document.getElementById('ai-model-input') as HTMLInputElement | null;
  if (!providerInput || !keyInput || !endpointInput || !modelInput) return;

  const config = getAIConfig();
  providerInput.value = config.provider;
  keyInput.value = config.apiKey;
  endpointInput.value = config.endpoint;
  modelInput.value = config.model;
}

function setProfileStatus(message: string): void {
  const status = document.getElementById('profile-settings-status');
  if (status) status.textContent = message;
}

export function setupProfileView(): void {
  const form = document.getElementById('settings-form') as HTMLFormElement | null;
  if (!form) return;

  const providerInput = document.getElementById('ai-provider-input') as HTMLSelectElement | null;
  const keyInput = document.getElementById('ai-api-key-input') as HTMLInputElement | null;
  const endpointInput = document.getElementById('ai-endpoint-input') as HTMLInputElement | null;
  const modelInput = document.getElementById('ai-model-input') as HTMLInputElement | null;
  const resetButton = document.getElementById('settings-reset');
  if (!providerInput || !keyInput || !endpointInput || !modelInput) return;

  populateSettingsForm();

  const profileNavButton = document.querySelector<HTMLElement>('[data-app-view="profile"]');
  profileNavButton?.addEventListener('click', () => {
    populateSettingsForm();
    setProfileStatus('');
  });

  providerInput.addEventListener('change', () => {
    const provider = providerInput.value as AIProviderKey;
    if (provider !== 'custom') {
      const preset = AI_ENDPOINTS[provider];
      endpointInput.value = preset.endpoint;
      modelInput.value = preset.model;
    }
  });

  resetButton?.addEventListener('click', () => {
    populateSettingsForm();
    setProfileStatus('Settings reset to saved values.');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const provider = providerInput.value as 'custom' | 'openai' | 'gemini' | 'claude' | 'mistral' | 'ollama';
    const key = keyInput.value.trim();
    const endpoint = endpointInput.value.trim();
    const model = modelInput.value.trim();

    localStorage.setItem('ai_provider', provider);
    if (key) localStorage.setItem('ai_api_key', key);
    else localStorage.removeItem('ai_api_key');
    if (endpoint) localStorage.setItem('ai_endpoint', endpoint);
    else localStorage.removeItem('ai_endpoint');
    if (model) localStorage.setItem('ai_model', model);
    else localStorage.removeItem('ai_model');

    const savedMessage = endpoint && model && (provider === 'ollama' || !!key)
      ? 'AI configuration saved.'
      : 'AI configuration saved, but it may be incomplete.';
    setProfileStatus(savedMessage);

    const aiStatus = document.getElementById('ai-status');
    if (aiStatus) aiStatus.textContent = savedMessage;
  });
}
