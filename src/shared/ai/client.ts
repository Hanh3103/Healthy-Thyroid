/**
 * AI transport layer.
 *
 * The config is supplied by the caller (the Pinia AI store) rather than read
 * from localStorage here, so Profile is the single owner of AI settings.
 */
import type { AIConfig } from '../../features/profile/model';

/** Minimal transport contract consumed by features that call an AI provider. */
export interface TextAIProvider {
  complete(prompt: string): Promise<string>;
}

export function createAITextProvider(config: AIConfig): TextAIProvider {
  return {
    complete: (prompt: string) => requestAIText(config, prompt),
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
          format: 'json',
        }),
      },
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
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      },
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
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
    };
  }

  return {
    url: config.endpoint,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    },
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
      signal: controller.signal,
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
