# @leados/config

Shared toolchain presets.

- **Prettier:** `@leados/config/prettier` (also mirrored in root `.prettierrc.json`).
- **ESLint:** centralized in the root `eslint.config.mjs` (ESLint 9 flat config). A single
  root config covers every workspace and owns the **module-boundary rules** (R-ARCH-1):
  `apps/web` may not import `apps/api`; cross-module access goes through a module's public
  `index.ts`. Each workspace's `lint` script runs `eslint` and ESLint resolves the root
  flat config automatically.
