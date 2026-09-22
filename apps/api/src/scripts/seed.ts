/**
 * `pnpm db:seed [-- --demo] [-- --force]`
 * On an empty database: creates the admin user, settings and the default pipeline.
 * `--demo` also adds realistic sample leads, contacts, deals, tasks and notes.
 * Refuses to run in production unless `--force` is given.
 */
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { env, isProduction } from '../config/env.js';
import { hashPassword } from '../lib/password.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { scoreWithRules } from '../modules/ai/index.js';
import { createDefaultPipeline } from '../modules/pipelines/index.js';
import { SETTINGS_ID } from '../modules/settings/index.js';

const args = new Set(process.argv.slice(2));
const demo = args.has('--demo');
const force = args.has('--force');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d: number, hour = 11) =>
  new Date(now - d * DAY - (now % DAY) + hour * 60 * 60 * 1000);

// Small deterministic PRNG so demo data is the same on every run.
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

async function main(): Promise<void> {
  if (isProduction && !force) {
    console.error(
      'Refusing to seed a production database. Re-run with --force if you really mean it.',
    );
    process.exit(1);
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Database already has ${existingUsers} user(s); nothing to seed.`);
    return;
  }

  const email = (env.SEED_ADMIN_EMAIL ?? 'admin@leados.local').toLowerCase();
  const generated = !env.SEED_ADMIN_PASSWORD;
  const password = env.SEED_ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');

  const passwordHash = await hashPassword(password);
  const memberHashes = demo ? await Promise.all([1, 2, 3].map(() => hashPassword(password))) : [];

  await prisma.$transaction(
    async (tx) => {
      await tx.appSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, companyName: demo ? 'Sharma Interiors Pvt Ltd' : 'My Company' },
        update: {},
      });
      if ((await tx.pipeline.count()) === 0) await createDefaultPipeline(tx);
      const admin = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Admin',
          lastName: demo ? 'Sharma' : '',
          role: 'ADMIN',
        },
      });
      if (demo) await seedDemo(tx, admin.id, memberHashes);
    },
    { timeout: 60_000 },
  );

  console.log('\nLeadOS is ready.');
  console.log(`  Admin email:    ${email}`);
  if (generated)
    console.log(`  Admin password: ${password}   (generated — change it after signing in)`);
  else console.log('  Admin password: (from SEED_ADMIN_PASSWORD)');
  if (demo)
    console.log(
      '  Demo team members (same password): priya@leados.local, rahul@leados.local, ananya@leados.local',
    );
}

const FIRST = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Ishaan',
  'Kavya',
  'Diya',
  'Meera',
  'Rohan',
  'Sneha',
  'Arjun',
  'Pooja',
  'Karthik',
  'Nisha',
  'Siddharth',
  'Lakshmi',
  'Farhan',
  'Gurpreet',
  'Harini',
  'Manoj',
  'Neha',
];
const LAST = [
  'Patel',
  'Iyer',
  'Reddy',
  'Khan',
  'Singh',
  'Nair',
  'Mehta',
  'Gupta',
  'Das',
  'Joshi',
  'Menon',
  'Bose',
  'Kulkarni',
  'Chopra',
  'Rao',
];
const COMPANIES = [
  'Tata Consultancy Services',
  'Infosys',
  'Zomato',
  'Swiggy',
  'Razorpay',
  'Freshworks',
  'Nykaa',
  'Byju’s',
  'Ola',
  'PhonePe',
  'Urban Company',
  'Zerodha',
  'Lenskart',
  'Meesho',
  'Cred',
  null,
  null,
];
const CITIES = [
  'Mumbai',
  'Bengaluru',
  'Pune',
  'Hyderabad',
  'Chennai',
  'Delhi',
  'Ahmedabad',
  'Kochi',
];
const SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'INSTAGRAM',
  'WHATSAPP',
  'FACEBOOK',
  'EVENT',
  'PHONE',
  'EMAIL',
  'MANUAL',
] as const;
const STATUSES = [
  'NEW',
  'NEW',
  'CONTACTED',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'LOST',
] as const;
const TAGS = [
  'hot',
  'vip',
  '2BHK',
  '3BHK',
  'office',
  'modular kitchen',
  'follow-up',
  'cold',
  'renovation',
];
const NOTES = [
  'Called — interested in a full home interior for their new 3BHK. Budget around ₹12 lakh.',
  'Visited the showroom with family. Liked the modular kitchen samples.',
  'Asked for a revised quote without the false ceiling.',
  'Prefers WhatsApp over calls. Available after 6 pm.',
  'Site measurement done. Possession expected next month.',
  'Comparing us with two other vendors; price is the main concern.',
];

async function seedDemo(tx: Tx, adminId: string, hashes: string[]): Promise<void> {
  const members = await Promise.all(
    [
      ['Priya', 'Nair', 'priya@leados.local'],
      ['Rahul', 'Verma', 'rahul@leados.local'],
      ['Ananya', 'Iyer', 'ananya@leados.local'],
    ].map(([firstName, lastName, email], i) =>
      tx.user.create({
        data: {
          firstName: firstName!,
          lastName: lastName!,
          email: email!,
          passwordHash: hashes[i]!,
          role: 'MEMBER',
          createdAt: daysAgo(120 - i),
        },
      }),
    ),
  );
  const team = [adminId, ...members.map((m) => m.id)];
  const pipeline = await tx.pipeline.findFirstOrThrow({
    where: { isDefault: true },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  const stages = pipeline.stages;
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);
  const wonStage = stages.find((s) => s.isWon)!;
  const lostStage = stages.find((s) => s.isLost)!;

  for (let i = 0; i < 40; i++) {
    const firstName = FIRST[i % FIRST.length]!;
    const lastName = pick(LAST);
    const company = pick(COMPANIES);
    const created = daysAgo(Math.floor(rand() * 85), 9 + Math.floor(rand() * 9));
    const converted = i % 8 === 0;
    const status = converted ? 'WON' : pick(STATUSES);
    const assignee = rand() < 0.85 ? pick(team) : null;
    const tags = [...new Set([pick(TAGS), ...(rand() < 0.4 ? [pick(TAGS)] : [])])];
    const hasEmail = rand() < 0.85;
    const leadEmail = hasEmail ? `${firstName}.${lastName}${i}@example.in`.toLowerCase() : null;
    const phone = rand() < 0.9 ? `+91 9${Math.floor(100000000 + rand() * 899999999)}` : null;
    const source = pick(SOURCES);
    const lastActivityAt = new Date(Math.min(now, created.getTime() + rand() * 20 * DAY));

    let contactId: string | null = null;
    if (converted) {
      const contact = await tx.contact.create({
        data: {
          firstName,
          lastName,
          email: leadEmail,
          phone,
          company,
          jobTitle: pick(['Founder', 'Operations Manager', 'Homeowner', 'Admin Head', 'Director']),
          tags,
          assignedToId: assignee,
          createdById: adminId,
          createdAt: created,
          lastActivityAt,
        },
      });
      contactId = contact.id;
    }

    const lead = await tx.lead.create({
      data: {
        firstName,
        lastName,
        email: leadEmail,
        phone,
        company,
        source,
        status,
        tags,
        lostReason:
          status === 'LOST'
            ? pick(['Budget too low', 'Chose another vendor', 'Project postponed'])
            : null,
        assignedToId: assignee,
        createdById: adminId,
        convertedToContactId: contactId,
        createdAt: created,
        lastActivityAt,
      },
    });
    await activity(tx, {
      type: 'LEAD_CREATED',
      description: `Lead created from ${source.charAt(0)}${source.slice(1).toLowerCase()} (${pick(CITIES)})`,
      performedById: adminId,
      relatedLeadId: lead.id,
      createdAt: created,
    });

    if (rand() < 0.6) {
      const content = pick(NOTES);
      const at = new Date(created.getTime() + 2 * DAY);
      await tx.note.create({
        data: { content, createdById: assignee ?? adminId, relatedLeadId: lead.id, createdAt: at },
      });
      await activity(tx, {
        type: 'NOTE_ADDED',
        description: `Note added: “${content.slice(0, 80)}”`,
        performedById: assignee ?? adminId,
        relatedLeadId: lead.id,
        createdAt: at,
      });
    }

    // Deals for qualified-and-later leads.
    if (
      ['PROPOSAL', 'NEGOTIATION', 'WON', 'QUALIFIED'].includes(status) ||
      (status === 'LOST' && rand() < 0.5)
    ) {
      const stage = status === 'WON' ? wonStage : status === 'LOST' ? lostStage : pick(openStages);
      const closed = stage.isWon || stage.isLost;
      const deal = await tx.deal.create({
        data: {
          title: `${company ?? `${firstName} ${lastName}`} — ${pick(['Full home interiors', 'Modular kitchen', 'Office fit-out', 'Wardrobes', 'Living room makeover'])}`,
          value: Math.round((1.5 + rand() * 20) * 100000),
          currency: 'INR',
          status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
          pipelineId: pipeline.id,
          stageId: stage.id,
          leadId: lead.id,
          contactId,
          assignedToId: assignee,
          createdById: adminId,
          expectedCloseDate: new Date(now + (5 + rand() * 50) * DAY),
          closedAt: closed
            ? new Date(Math.min(now, created.getTime() + (5 + rand() * 25) * DAY))
            : null,
          lostReason: stage.isLost ? 'Chose another vendor' : null,
          createdAt: new Date(created.getTime() + DAY),
        },
      });
      await activity(tx, {
        type: 'DEAL_CREATED',
        description: `Deal "${deal.title}" created in ${stage.name}`,
        performedById: assignee ?? adminId,
        relatedLeadId: lead.id,
        relatedDealId: deal.id,
        relatedContactId: contactId,
        createdAt: deal.createdAt,
      });
    }

    if (status !== 'WON' && status !== 'LOST' && rand() < 0.7) {
      const due = new Date(now + (rand() * 10 - 3) * DAY);
      await tx.task.create({
        data: {
          title: pick([
            'Call to discuss quote',
            'Send design catalogue',
            'Schedule site visit',
            'Share revised estimate',
            'Follow up on WhatsApp',
          ]),
          type: pick(['CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'DEMO'] as const),
          priority: pick(['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'URGENT'] as const),
          dueDate: due,
          reminderSentAt: due.getTime() < now ? due : null, // don't flood new installs with reminders
          assignedToId: assignee ?? adminId,
          createdById: adminId,
          relatedLeadId: lead.id,
          createdAt: created,
        },
      });
    }

    // Initial rules-based score so lists and filters have data.
    const score = scoreWithRules({
      lead: {
        firstName,
        lastName,
        email: leadEmail,
        phone,
        company,
        source,
        status,
        tags,
        createdAt: created,
        lastActivityAt,
      },
      openDeals: [],
      activities: [],
      now: new Date(),
    });
    await tx.aiScore.create({
      data: {
        leadId: lead.id,
        score: score.score,
        factors: score.factors as unknown as Prisma.InputJsonValue,
        recommendation: score.recommendation,
        modelVersion: score.modelVersion,
        triggeredBy: 'auto',
      },
    });
    await tx.lead.update({
      where: { id: lead.id },
      data: { aiScore: score.score, aiScoreUpdatedAt: new Date() },
    });
  }
}

function activity(tx: Tx, data: Prisma.ActivityUncheckedCreateInput) {
  return tx.activity.create({ data });
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
