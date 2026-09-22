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

/** Like booleanFlag, but undefined when unset so the default can depend on other values. */
const optionalBooleanFlag = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === '') return undefined;
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected true or false' });
    return z.NEVER;
  });

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = () => z.preprocess(emptyToUndefined, z.string().trim().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).default('file:./data/leados.db'),
  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  // AI provider (lead scoring + Instagram replies). See modules/ai/ai.provider.ts.
  AI_PROVIDER: z.preprocess(
    (v) => (typeof v === 'string' ? emptyToUndefined(v.trim().toLowerCase()) : v),
    z.enum(['gemini', 'groq', 'openai']).optional(),
  ),
  AI_MODEL: optionalString(),
  GEMINI_API_KEY: optionalString(),
  GROQ_API_KEY: optionalString(),
  OPENAI_API_KEY: optionalString(),
  OPENAI_MODEL: optionalString(), // legacy alias for AI_MODEL when the provider is openai
  // Instagram
  INSTAGRAM_GRAPH_VERSION: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^v\d+\.\d+$/, 'Expected a version like v23.0')
      .default('v23.0'),
  ),
  INSTAGRAM_TEST_MODE: optionalBooleanFlag,
  META_APP_SECRET: optionalString(),
  META_WEBHOOK_VERIFY_TOKEN: optionalString(),
  PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ENCRYPTION_KEY: z.preprocess(
    emptyToUndefined,
    z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters').optional(),
  ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: booleanFlag(false),
  WEB_DIST_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  SEED_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  SEED_ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
});

export type Env = Omit<z.infer<typeof schema>, 'INSTAGRAM_TEST_MODE'> & {
  LOG_LEVEL: string;
  DATABASE_URL: string;
  /** Sandbox Instagram adapter + simulate endpoint. Default: on in development only. */
  INSTAGRAM_TEST_MODE: boolean;
};

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
    INSTAGRAM_TEST_MODE: env.INSTAGRAM_TEST_MODE ?? env.NODE_ENV === 'development',
    PUBLIC_URL: env.PUBLIC_URL?.replace(/\/+$/, ''),
  };
}

export const env: Env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
