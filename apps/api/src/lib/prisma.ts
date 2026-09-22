import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * SQLite allows one writer at a time. A single pooled connection serialises queries inside
 * the process, which avoids SQLITE_BUSY errors between concurrent requests and background jobs.
 * Never call the global client from inside an interactive transaction — use the `tx` handle.
 */
function withConnectionLimit(url: string): string {
  if (!url.startsWith('file:') || url.includes('connection_limit=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`;
}

export const prisma = new PrismaClient({ datasourceUrl: withConnectionLimit(env.DATABASE_URL) });

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/** Enables WAL so reads (e.g. Prisma Studio, backups) don't block the app's writes. */
export async function configureDatabase(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
}
