import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';

// Runs in every test file before any app module is imported: point the app at a private
// copy of the migrated template database.
const tmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp');
const dbFile = path.join(tmp, `test-${crypto.randomUUID()}.db`);
fs.copyFileSync(path.join(tmp, 'template.db'), dbFile);

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.BCRYPT_COST = '4';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.LOG_LEVEL = 'silent';
delete process.env.OPENAI_API_KEY;

afterAll(async () => {
  const { prisma } = await import('../src/lib/prisma.js');
  await prisma.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm'])
    fs.rmSync(dbFile + suffix, { force: true });
});
