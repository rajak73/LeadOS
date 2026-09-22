import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please';

/** Parses "true"/"false"/"1"/"0"/"yes"/"no" properly (z.coerce.boolean() treats "false" as true). */
const booleanFlag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return fallback;
      const s = v.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(s)) return true;
      if (['false', '0', 'no', 'off'].includes(s)) return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected true or false' });
      return z.NEVER;
    });

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).default('file:./data/leados.db'),
  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().default('gpt-4o-mini')),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: booleanFlag(false),
  WEB_DIST_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  SEED_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  SEED_ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
});

export type Env = z.infer<typeof schema> & { LOG_LEVEL: string; DATABASE_URL: string };

/**
 * Prisma resolves relative SQLite paths against the directory of schema.prisma when running
 * migrations. Resolve them the same way at runtime (by finding prisma/schema.prisma above the
 * working directory) so the app, the CLI and the seed script all use the same file.
 */
export function findSchemaDir(cwd = process.cwd()): string | null {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) return path.join(dir, 'prisma');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveDatabaseUrl(url: string, cwd = process.cwd()): string {
  if (!url.startsWith('file:')) return url;
  const [rawPath = '', query] = url.slice('file:'.length).split('?');
  if (path.isAbsolute(rawPath)) {
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    return url;
  }
  const absolute = path.resolve(findSchemaDir(cwd) ?? cwd, rawPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return `file:${absolute}${query ? `?${query}` : ''}`;
}

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }
  const env = parsed.data;
  if (
    env.NODE_ENV === 'production' &&
    (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET.length < 32)
  ) {
    console.error(
      'JWT_SECRET must be set to a random value of at least 32 characters in production.',
    );
    process.exit(1);
  }
  return {
    ...env,
    DATABASE_URL: resolveDatabaseUrl(env.DATABASE_URL),
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  };
}

export const env: Env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
