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
// Never let a developer's real AI or Meta settings leak into tests.
for (const key of [
  'AI_PROVIDER',
  'AI_MODEL',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'PUBLIC_URL',
  'ENCRYPTION_KEY',
  'INSTAGRAM_TEST_MODE',
])
  delete process.env[key];

afterAll(async () => {
  const { prisma } = await import('../src/lib/prisma.js');
  await prisma.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm'])
    fs.rmSync(dbFile + suffix, { force: true });
});
