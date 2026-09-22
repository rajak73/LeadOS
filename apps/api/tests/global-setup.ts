import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TMP_DIR = path.join(here, '.tmp');
export const TEMPLATE_DB = path.join(TMP_DIR, 'template.db');

/** Applies the real migrations to a template database that each test file copies. */
export default function setup(): () => void {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(
    process.execPath,
    [cli, 'migrate', 'deploy', `--schema=${path.resolve(here, '../../../prisma/schema.prisma')}`],
    {
      env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
      stdio: 'pipe',
    },
  );
  return () => fs.rmSync(TMP_DIR, { recursive: true, force: true });
}
