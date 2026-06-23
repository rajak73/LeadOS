import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../prisma/client.js';
import { tenantExtension } from '../tenancy/tenant-extension.js';
import { runInTenantScope } from '../tenancy/scope.js';
import { TENANT_GUC } from '../tenancy/tenant-tables.js';

export const replicaPrisma = env.DATABASE_REPLICA_URL
  ? new PrismaClient({
      datasources: {
        db: {
          url: env.DATABASE_REPLICA_URL,
        },
      },
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  : prisma;

function buildReplicaTenantClient(organizationId: string) {
  return replicaPrisma.$extends(tenantExtension(organizationId));
}

export type ReplicaTenantClient = ReturnType<typeof buildReplicaTenantClient>;
export type ReplicaTenantTransactionClient = Parameters<
  Parameters<ReplicaTenantClient['$transaction']>[0]
>[0];

export async function withReplicaTenant<T>(
  organizationId: string,
  fn: (db: ReplicaTenantTransactionClient) => Promise<T>,
): Promise<T> {
  const client = buildReplicaTenantClient(organizationId);
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('${TENANT_GUC}', $1, true)`, organizationId);
    return runInTenantScope(organizationId, () => fn(tx));
  });
}
