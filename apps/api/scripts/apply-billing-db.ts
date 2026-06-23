import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1. Create BillingPlanId enum if not exists
    const enumExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingPlanId')`
    );
    if (!enumExists[0]?.exists) {
      await prisma.$executeRawUnsafe(`CREATE TYPE "BillingPlanId" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE')`);
      console.log('Created BillingPlanId enum');
    }

    // 2. Create billing_plans table if not exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "billing_plans" (
        "id" "BillingPlanId" NOT NULL,
        "name" TEXT NOT NULL,
        "stripePriceId" TEXT,
        "monthlyPrice" DECIMAL(10,2) NOT NULL,
        "maxUsers" INTEGER,
        "maxLeads" INTEGER,
        "features" JSONB NOT NULL DEFAULT '[]',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('Created billing_plans table');

    // Create unique index on stripePriceId if not exists
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "billing_plans_stripePriceId_key" ON "billing_plans"("stripePriceId")
    `);

    // 3. Alter subscriptions table to add columns if they don't exist
    const subColumns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions'`
    );
    const existingCols = subColumns.map(c => c.column_name);

    if (!existingCols.includes('planId')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "subscriptions" ADD COLUMN "planId" "BillingPlanId"`);
      console.log('Added planId to subscriptions');
    }
    if (!existingCols.includes('stripeCurrentPeriodEnd')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "subscriptions" ADD COLUMN "stripeCurrentPeriodEnd" TIMESTAMP(3)`);
      console.log('Added stripeCurrentPeriodEnd to subscriptions');
    }
    if (!existingCols.includes('cancelAtPeriodEnd')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "subscriptions" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false`);
      console.log('Added cancelAtPeriodEnd to subscriptions');
    }

    // Add FK constraint if not exists
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "subscriptions" 
        ADD CONSTRAINT "subscriptions_planId_fkey" 
        FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE
      `);
      console.log('Added FK constraint subscriptions_planId_fkey');
    } catch (e) {
      console.log('FK constraint subscriptions_planId_fkey already exists or could not be added:', (e as Error).message);
    }

    // Add indexes to subscriptions if they don't exist
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId")`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "subscriptions_stripeCustomerId_idx" ON "subscriptions"("stripeCustomerId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "subscriptions_stripeSubscriptionId_idx" ON "subscriptions"("stripeSubscriptionId")`);

    // 4. Create stripe_webhook_events table if not exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
        "id" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('Created stripe_webhook_events table');

    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "stripe_webhook_events_type_idx" ON "stripe_webhook_events"("type")`);

    // 5. Seed initial billing plans if billing_plans is empty
    const count = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM billing_plans`);
    if (Number(count[0]?.count ?? 0) === 0) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO billing_plans (id, name, "stripePriceId", "monthlyPrice", "maxUsers", "maxLeads", features, "isActive", "createdAt", "updatedAt")
        VALUES 
          ('STARTER', 'Starter', 'price_starter', 29.00, 3, 1000, '["leads", "deals"]'::jsonb, true, now(), now()),
          ('GROWTH', 'Growth', 'price_growth', 79.00, 10, 5000, '["leads", "deals", "workflows"]'::jsonb, true, now(), now()),
          ('ENTERPRISE', 'Enterprise', 'price_enterprise', 249.00, null, null, '["leads", "deals", "workflows", "analytics"]'::jsonb, true, now(), now())
      `);
      console.log('Seeded initial billing plans');
    }

  } catch (err) {
    console.error('Error applying billing schema:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
