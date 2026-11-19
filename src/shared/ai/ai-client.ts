import type { TextAIProvider } from '../contracts';

export type AIProvider = 'custom' | 'openai' | 'gemini' | 'claude' | 'mistral' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  endpoint: string;
  model: string;
}

export function createAITextProvider(): TextAIProvider {
  const config = getAIConfig();
  return {
    complete: (prompt: string) => requestAIText(config, prompt)
  };
}

export const AI_ENDPOINTS: Record<Exclude<AIProvider, 'custom'>, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-3.5-flash' },
  claude: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-haiku-latest' },
  mistral: { endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
  ollama: { endpoint: 'http://localhost:11434/api/chat', model: 'llama3.2' }
};

export function getAIConfig(): AIConfig {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const geminiKey = env?.VITE_GEMINI_API_KEY?.trim();
  const provider = (localStorage.getItem('ai_provider')
    || env?.VITE_AI_PROVIDER
    || (geminiKey ? 'gemini' : '')
    || 'custom') as AIProvider;
  const providerPreset = provider === 'gemini' ? AI_ENDPOINTS.gemini
    : provider === 'openai' ? AI_ENDPOINTS.openai
    : provider === 'claude' ? AI_ENDPOINTS.claude
    : provider === 'mistral' ? AI_ENDPOINTS.mistral
    : provider === 'ollama' ? AI_ENDPOINTS.ollama
    : null;
  return {
    provider,
    apiKey: localStorage.getItem('ai_api_key')?.trim()
      || env?.VITE_AI_API_KEY?.trim()
      || geminiKey
      || '',
    endpoint: localStorage.getItem('ai_endpoint')?.trim()
      || env?.VITE_AI_ENDPOINT?.trim()
      || providerPreset?.endpoint
      || '',
    model: localStorage.getItem('ai_model')?.trim()
      || env?.VITE_AI_MODEL?.trim()
      || providerPreset?.model
      || ''
  };
}

function buildAIRequest(config: AIConfig, prompt: string): { url: string; init: RequestInit } {
  if (config.provider === 'ollama') {
    return {
      url: config.endpoint,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          format: 'json'
        })
      }
    };
  }

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
  const controller = new AbortController();
  const timeoutMs = 90_000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request.url, {
      ...request.init,
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text();
      let detail = body;
      try {
        const parsed = JSON.parse(body) as {
          error?: { message?: string };
          candidates?: Array<{ finishReason?: string }>;
        };
        detail = parsed.error?.message || parsed.candidates?.[0]?.finishReason || body;
      } catch {
        // Keep the raw provider response when it is not JSON.
      }
      throw new Error(`AI provider HTTP ${response.status}: ${detail || 'Request failed'}`);
    }

    const data = await response.json();
    if (config.provider === 'gemini') {
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')
        .trim();
      if (text) return text;
      throw new Error(
        data?.promptFeedback?.blockReason
          ? `Gemini blocked the response: ${data.promptFeedback.blockReason}`
          : 'Gemini returned an empty response.',
      );
    }
    if (config.provider === 'claude') {
      return data?.content?.map((part: { text?: string }) => part.text || '').join('') ?? '';
    }
    if (config.provider === 'ollama') {
      return data?.message?.content ?? '';
    }
    return data?.choices?.[0]?.message?.content ?? '';
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`AI request timed out after ${timeoutMs / 1000} seconds.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
