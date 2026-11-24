/** Build and license information for the About settings section. */
import { isTauri, tauriInvoke } from '../../shared/platform.ts';

export interface AppInfo {
  version: string;
  promptVersion: string;
  licenses: string[];
}

const BROWSER_INFO: AppInfo = {
  version: '0.1.0',
  promptVersion: '1.0.0',
  licenses: [
    'Healthy Thyroid — Apache-2.0',
    'Vue.js — MIT',
    'Element Plus — MIT',
    'Tauri — Apache-2.0 OR MIT',
    'Tesseract.js — Apache-2.0',
  ],
};

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) return BROWSER_INFO;
  try {
    return await tauriInvoke<AppInfo>('app_info', {});
  } catch {
    return BROWSER_INFO;
  }
}
