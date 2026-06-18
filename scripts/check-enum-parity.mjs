// CI gate: assert the enums in packages/shared match prisma/schema.prisma.
// In Sprint 1 the Prisma schema declares enums but no domain models yet; this script
// verifies that every enum present in BOTH files has an identical member set.
// It is intentionally tolerant of enums that exist in only one place during bootstrap,
// but FAILS on any mismatch of members for a shared enum name.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parsePrismaEnums(src) {
  const enums = {};
  const re = /enum\s+(\w+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const members = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
      .map((l) => l.split(/\s+/)[0]);
    enums[name] = members.sort();
  }
  return enums;
}

function parseSharedEnums(src) {
  // Matches: export const Foo = { A: 'A', B: 'B' } as const;
  const enums = {};
  const re = /export const (\w+) = \{([^}]*)\} as const/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const members = [...m[2].matchAll(/(\w+)\s*:/g)].map((x) => x[1]).sort();
    enums[name] = members;
  }
  return enums;
}

let prismaSrc = '';
let sharedSrc = '';
try {
  prismaSrc = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
} catch {
  console.log('enum-parity: prisma/schema.prisma not found yet — skipping.');
  process.exit(0);
}
try {
  sharedSrc = readFileSync(resolve(root, 'packages/shared/src/constants/enums.ts'), 'utf8');
} catch {
  console.log('enum-parity: shared enums not found yet — skipping.');
  process.exit(0);
}

const prismaEnums = parsePrismaEnums(prismaSrc);
const sharedEnums = parseSharedEnums(sharedSrc);

const shared = Object.keys(prismaEnums).filter((k) => k in sharedEnums);
let failed = false;
for (const name of shared) {
  const a = JSON.stringify(prismaEnums[name]);
  const b = JSON.stringify(sharedEnums[name]);
  if (a !== b) {
    failed = true;
    console.error(`enum-parity MISMATCH for ${name}:`);
    console.error(`  prisma: ${a}`);
    console.error(`  shared: ${b}`);
  }
}

if (failed) {
  console.error('enum-parity: FAILED');
  process.exit(1);
}
console.log(`enum-parity: OK (${shared.length} shared enum(s) checked).`);
