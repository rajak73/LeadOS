/**
 * Runs Prisma CLI commands against the same database the app uses (DATABASE_URL resolved the
 * same way, defaulting to prisma/data/leados.db).
 *   (default)  prisma migrate deploy      — apply pending migrations (also used at container start)
 *   --create   prisma migrate dev          — create a new migration (development)
 *   --studio   prisma studio
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { env, findSchemaDir } from '../config/env.js';

const schemaDir = findSchemaDir();
if (!schemaDir) {
  console.error('Could not find prisma/schema.prisma above the current directory.');
  process.exit(1);
}
const flag = process.argv[2];
const extra = process.argv.slice(3);
const command =
  flag === '--create'
    ? ['migrate', 'dev', ...extra]
    : flag === '--studio'
      ? ['studio', ...extra]
      : ['migrate', 'deploy'];

const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const result = spawnSync(
  process.execPath,
  [cli, ...command, `--schema=${path.join(schemaDir, 'schema.prisma')}`],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
  },
);
process.exit(result.status ?? 1);
