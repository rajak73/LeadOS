// Organization slug generation (doc 07 §7.7): URL-safe, lowercase, 3–30 chars,
// alphanumeric + hyphens. Uniqueness is ensured by probing the repository (the DB unique
// constraint is the final guard).

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  // Ensure a minimum length / non-empty.
  return base.length >= 3 ? base : `org-${base}`.slice(0, 30);
}

export async function uniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  if (!(await isTaken(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base.slice(0, 26)}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Extremely unlikely; fall back to a random suffix.
  return `${base.slice(0, 22)}-${Math.floor(performance.now()).toString(36)}`;
}
