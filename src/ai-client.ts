export type AIProvider = 'custom' | 'openai' | 'gemini' | 'claude' | 'mistral';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  endpoint: string;
  model: string;
}

export const AI_ENDPOINTS: Record<Exclude<AIProvider, 'custom'>, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.5-flash' },
  claude: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-haiku-latest' },
  mistral: { endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' }
};

export function getAIConfig(): AIConfig {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const provider = (localStorage.getItem('ai_provider')
    || env?.VITE_AI_PROVIDER
    || 'custom') as AIProvider;
  return {
    provider,
    apiKey: localStorage.getItem('ai_api_key')?.trim() || env?.VITE_AI_API_KEY?.trim() || '',
    endpoint: localStorage.getItem('ai_endpoint')?.trim() || env?.VITE_AI_ENDPOINT?.trim() || '',
    model: localStorage.getItem('ai_model')?.trim() || env?.VITE_AI_MODEL?.trim() || ''
  };
}

function buildAIRequest(config: AIConfig, prompt: string): { url: string; init: RequestInit } {
  if (config.provider === 'gemini') {
    return {
      url: `${config.endpoint}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        })
      }
    };
  }

  if (config.provider === 'claude') {
    return {
      url: config.endpoint,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      }
    };
  }

  return {
    url: config.endpoint,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    }
  };
}

export async function requestAIText(config: AIConfig, prompt: string): Promise<string> {
  const request = buildAIRequest(config, prompt);
  const response = await fetch(request.url, request.init);
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);

  const data = await response.json();
  if (config.provider === 'gemini') {
    return data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') ?? '';
  }
  if (config.provider === 'claude') {
    return data?.content?.map((part: { text?: string }) => part.text || '').join('') ?? '';
  }
  return data?.choices?.[0]?.message?.content ?? '';
}
