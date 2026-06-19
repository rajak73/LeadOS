// Vitest global setup — runs once before any test module is evaluated.
// Loads the workspace-root .env file into process.env so that DATABASE_URL,
// DATABASE_APP_URL, REDIS_URL etc. are available when isPostgresUp() and
// isRedisUp() are called at test-file top level.
//
// In CI these vars are already in the environment (set by ci.yml / docker-compose),
// so this file is a no-op there (we never overwrite existing values).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export function setup(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '../../../.env');

  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return; // .env absent (e.g. fresh CI checkout without dotenv step) — skip
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    // Never overwrite vars already set in the environment (CI sets them explicitly).
    // Skip empty values — they are documentation placeholders in .env.example/.env
    // and letting them through would cause Zod's min(1) validation to fail for
    // JWT_ACCESS_SECRET etc. (which have secure defaults when absent).
    if (key && val && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
