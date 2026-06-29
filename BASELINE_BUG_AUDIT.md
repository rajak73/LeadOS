# BASELINE BUG AUDIT

## 1. Issue Overview
The current `@leados/web` application is failing the `pnpm typecheck` verification process. This prevents the repository from reaching a clean baseline state. 

## 2. Root Cause & File Paths
There are two main issues causing the typecheck failures:

1. **Incorrect Button Variant Usage**
   - **Path:** `apps/web/src/app/(onboarding)/page.tsx`
   - **Root Cause:** The `Button` component is being invoked with `variant="outline"` on lines 75, 103, 135, 162, 187, 210, 231, 240, and 248. However, the custom `Button` component only accepts `'primary' | 'secondary' | 'ghost' | 'danger'`.
   
2. **Unused Import Warning**
   - **Path:** `apps/web/src/app/(onboarding)/layout.tsx`
   - **Root Cause:** `Link` is imported from `'next/link'` on line 2, but it is never utilized in the component. The TypeScript compiler is configured to treat unused locals/imports as errors (`noUnusedLocals: true`).

## 3. Origin Status
**Pre-existing:** These issues are pre-existing in the baseline repository codebase. They were discovered during the initial mandatory reality audit when `pnpm typecheck` was run prior to implementing Sprint 10.

## 4. Duplication Audit & Resolution Strategy
We will strictly adhere to the non-duplication rules:

- **Files to Reuse:** 
  - `apps/web/src/components/ui/Button.tsx`: We will reuse the existing `Button` component. It already defines a `secondary` variant (`bg-bg-elevated border border-border`) which matches the visual semantics of an "outline" button. 
- **Files to Extend:** None required.
- **Files to Create:** None.
- **Duplication Risk:** **Low.** The risk of duplication is mitigated by updating the consumption of the `Button` in `page.tsx` to use the pre-existing `secondary` variant, rather than duplicating the `Button` component or extending its type signature unnecessarily.

## 5. Proposed Fix
1. In `apps/web/src/app/(onboarding)/page.tsx`, replace all instances of `variant="outline"` with `variant="secondary"`.
2. In `apps/web/src/app/(onboarding)/layout.tsx`, delete line 2 (`import Link from 'next/link';`).
