# ENVIRONMENT_READY.md

> **Final environment validation — Sprint 1 continuation gate**
> Owner: Engineering Manager, LeadOS · Date: 2026-06-18
> Scope: validation only. No code, features, or architecture changed.
> Verdict: **✅ READY — environment aligned to the project standard; full pipeline green under Node 20.**

---

## 1. Validation Summary

| Check | Required (standard) | Observed | Status |
|---|---|---|---|
| **Active Node version** | 20 LTS (`.nvmrc` = `20`; FINAL_ARCHITECTURE §8 / doc 06 §6.3) | **v20.20.2** | ✅ |
| **Node executable path** | nvm-managed (not Homebrew) | `~/.nvm/versions/node/v20.20.2/bin/node` | ✅ |
| **Active pnpm version** | `pnpm@9.15.9` (`packageManager`) | **9.15.9** (`~/.nvm/.../v20.20.2/bin/pnpm`) | ✅ |
| **npm (bundled)** | n/a (bootstrap only) | 10.8.2 (ships with Node 20) | ➖ |
| **corepack** | available to pin pnpm | **0.34.6** on PATH | ✅ |
| **nvm current** | v20.x | `v20.20.2` | ✅ |
| **nvm default alias** | `20` | `default → 20 → v20.20.2` | ✅ |
| **Homebrew Node 25** | unlinked (no PATH shadow) | `/opt/homebrew/bin/node` absent | ✅ |
| **`engines.node`** | `">=20"` | `">=20"` (satisfied by 20.20.2) | ✅ |
| **CI parity** | CI pins `node-version: 20` (4 workflows) | local now matches CI | ✅ |
| **Package-manager alignment** | `packageManager: pnpm@9.15.9` | active pnpm = 9.15.9 | ✅ |

**All previously-flagged drift is resolved:** the default alias now points to 20 (was 24), Homebrew's Node 25 is unlinked (no longer shadows PATH), and fresh shells resolve Node 20 via nvm.

---

## 2. Workspace Health (validated under Node 20.20.2)

| Step | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ lockfile consistent with `package.json`; **Prisma client regenerated under Node 20** (apps/api postinstall) |
| `pnpm typecheck` | ✅ 4/4 workspaces (TS strict) |
| `pnpm lint` | ✅ 4/4 (incl. module-boundary rules) |
| `pnpm test` | ✅ **41 passed, 1 gated-skip** — shared 8, web 5, api 28 (+1 Redis-gated) |
| `pnpm build` | ✅ shared (tsup) + api (server+worker) + web (next build) |

All 6 workspace packages resolve (`@leados/api`, `@leados/web`, `@leados/shared`, `@leados/config`, `@leados/tsconfig`, root). The Prisma engine resolves to `darwin-arm64`.

---

## 3. Clean Reinstall — Determination

**Not required.** Rationale, backed by evidence gathered in this validation:

1. **`pnpm install --frozen-lockfile` passed under Node 20** — the lockfile is consistent and pnpm re-validated the dependency graph against the active runtime without changes.
2. **The postinstall ran under Node 20** — `prisma generate` re-executed and regenerated the client under the correct runtime during the frozen install (the one materially runtime-sensitive step), so it is not carrying Node-25 state.
3. **The full pipeline is green under Node 20** — typecheck, lint, all tests, and all builds pass.
4. **The native dependencies are ABI-stable across Node majors** — Prisma engine (platform binary), `esbuild` (Go binary), `sharp` / `msgpackr-extract` (N-API prebuilds). None are bound to the Node 25 ABI, so nothing needs recompilation for Node 20.

> The `node_modules` directory was originally materialized under Node 25 (mtime 2026-06-18 17:09), but the frozen-lockfile install under Node 20 has since re-validated it and regenerated the runtime-sensitive Prisma client. There is no functional or parity gap to close.

### Optional (belt-and-suspenders hygiene — NOT necessary)
If you want a from-scratch reinstall under Node 20 for absolute cleanliness:
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd /Users/rajakumar/lead_os
nvm use                 # confirm v20.x is active
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install            # rebuilds + regenerates Prisma client under Node 20
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
**Rationale if you choose to run it:** guarantees every artifact in `node_modules` was created under the pinned runtime with zero Node-25 residue. Purely precautionary — the evidence above shows the current install is already healthy and CI-equivalent.

---

## 4. CI Parity Statement

Local and CI now run the **same runtime and package manager**:

| | Local (validated) | CI (`.github/workflows/*`) |
|---|---|---|
| Node | v20.20.2 | `actions/setup-node@v4` → `node-version: 20` |
| pnpm | 9.15.9 | `pnpm/action-setup@v4` → version 9 |
| Install | `pnpm install --frozen-lockfile` ✅ | `pnpm install --frozen-lockfile` |
| Gates | typecheck / lint / test / build ✅ | same + audit, enum-parity, secret-leak guard |

"Works locally" now implies "works in CI" for the runtime dimension. The only intentional local↔CI difference remains the two **infra-gated integration tests** (queue round-trip, deep-health-green), which require Postgres + Redis and therefore run in CI's docker-compose services — the documented gating pattern, unrelated to the Node alignment.

---

## 5. Verdict

**✅ Environment is READY for Sprint 1 to continue.**

- Active Node = **20.20.2** (nvm, default alias = 20, Homebrew 25 unlinked).
- Active pnpm = **9.15.9**, matching `packageManager`.
- Workspace health green under Node 20: install (frozen), typecheck, lint, test, build all pass.
- **Clean reinstall: not required** (optional hygiene commands provided).
- Local ↔ CI runtime parity achieved.

No further environment action is needed before resuming Sprint 1. One small standing recommendation (optional, not done here): consider tightening `engines.node` from `">=20"` to `"20.x"` so an off-standard Node fails fast at install time — a one-line change to flag, not an architectural decision.
