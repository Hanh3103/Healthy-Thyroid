import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUFFIXES = ['', '.ts', '.tsx', '/index.ts'];
const RESOLVE_ERRORS = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT']);

/** Vite-style resolution for the handful of TS modules imported by Node tests. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!/^(?:\.{1,2}\/|\/|file:)/.test(specifier)) return nextResolve(specifier, context);
    let lastError;
    for (const suffix of SUFFIXES) {
      try {
        return nextResolve(specifier + suffix, context);
      } catch (error) {
        if (!RESOLVE_ERRORS.has(error?.code)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  },

  load(url, context, nextLoad) {
    // useDiet.ts imports the facts file without a JSON import attribute.
    if (url.endsWith('.json')) {
      return {
        format: 'module',
        source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
