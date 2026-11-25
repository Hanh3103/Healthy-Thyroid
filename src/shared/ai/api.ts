/**
 * Shared AI command boundary.
 *
 * The raw API key never reaches Vue; provider/model/key management is done by
 * the status commands in `aiStatus.ts`. This module only wraps the connection
 * test used by Settings and the header popover.
 */
import { isTauri, tauriInvoke } from '../platform.ts';

export async function testAiConnection(): Promise<string> {
  if (!isTauri()) throw new Error('Connection test is available only in the desktop app.');
  return tauriInvoke<string>('test_connection', {});
}
