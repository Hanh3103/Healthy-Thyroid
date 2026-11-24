/**
 * Human-readable AI configuration status for the planner's AI Prioritize button.
 *
 * The API key lives only in Rust app data; the webview gets a key-free status
 * object. These helpers turn that status into a short chip label and a sentence
 * that can be shown next to the button and in the status line.
 */
import type { AiCredentialsStatus } from '../profile/model.ts';

export type AiConfigState = 'ready' | 'missing' | 'unknown' | 'unsupported';

export interface AiConfigView {
  state: AiConfigState;
  label: string;
  /** Leading space so it can be appended to an existing status sentence. */
  note: string;
  configured: boolean;
}

/** Browser mode cannot read the desktop-only credentials store. */
export function unsupportedAiConfig(): AiConfigView {
  return {
    state: 'unsupported',
    label: 'AI needs desktop app',
    note: ' AI configuration is available only in the desktop app: run npm run tauri dev, then open Settings > AI.',
    configured: false,
  };
}

/** The status check itself failed (e.g. the Tauri command was unavailable). */
export function unknownAiConfig(): AiConfigView {
  return {
    state: 'unknown',
    label: 'AI status unknown',
    note: ' Could not check AI configuration.',
    configured: false,
  };
}

export function describeAiConfig(status: AiCredentialsStatus | null, inDesktop: boolean): AiConfigView {
  if (!inDesktop) return unsupportedAiConfig();
  if (!status) return unknownAiConfig();
  if (!status.configured) {
    return {
      state: 'missing',
      label: 'AI not configured',
      note: ' AI is not configured: open Settings > AI to add a provider, model and API key.',
      configured: false,
    };
  }
  const providerModel = `${status.provider || 'provider'}/${status.model || 'default model'}`;
  return {
    state: 'ready',
    label: 'AI configured',
    note: ` AI configured (${providerModel}).`,
    configured: true,
  };
}
