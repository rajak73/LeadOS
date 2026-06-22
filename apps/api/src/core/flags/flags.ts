// Feature flags + kill switches (INFRA-4.1 / M5). Env/DB-backed; Sprint 1 ships an
// env-overridable in-memory store with runtime toggle. Doubles as the plan-feature gate
// and the operational kill switch (e.g., disable Instagram sends during a Meta incident).

export type FlagKey =
  | 'instagram.sends.enabled'
  | 'whatsapp.sends.enabled'
  | 'ai.scoring.enabled'
  | 'workflows.execution.enabled'
  | 'signups.enabled'
  // Sprint 7 M1 — email notification channel. Default OFF until the sending
  // domain is SPF/DKIM-verified; in-app notifications are unaffected by this flag.
  | 'notifications.email.enabled';

const DEFAULTS: Record<FlagKey, boolean> = {
  'instagram.sends.enabled': true,
  'whatsapp.sends.enabled': true,
  'ai.scoring.enabled': true,
  'workflows.execution.enabled': true,
  'signups.enabled': true,
  'notifications.email.enabled': false,
};

const overrides = new Map<FlagKey, boolean>();

/** Env override: FLAG_<KEY_WITH_UNDERSCORES>=true|false at boot. */
function envOverride(key: FlagKey): boolean | undefined {
  const envKey = `FLAG_${key.replace(/[.]/g, '_').toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw === undefined) return undefined;
  return raw === 'true' || raw === '1';
}

export function isEnabled(key: FlagKey): boolean {
  if (overrides.has(key)) return overrides.get(key) as boolean;
  const fromEnv = envOverride(key);
  if (fromEnv !== undefined) return fromEnv;
  return DEFAULTS[key];
}

/** Runtime kill switch / toggle. */
export function setFlag(key: FlagKey, value: boolean): void {
  overrides.set(key, value);
}

export function resetFlags(): void {
  overrides.clear();
}
