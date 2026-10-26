import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads <repo root>/.env (or the file named by OMNIA_ENV_FILE) into
 * process.env. Import this FIRST in any entry point: ES imports run before
 * the importing file's own statements, so a module that reads process.env
 * when it loads (the store's SITE_DB_DIR, the meter event name) only sees
 * .env values if this module has already run. Variables the host sets
 * directly win, and an absent file is fine.
 */
try {
  process.loadEnvFile(process.env.OMNIA_ENV_FILE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'));
} catch {
  /* no .env yet */
}
