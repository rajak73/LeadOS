<!-- LeadOS PR template -->

## What
<!-- One-paragraph summary. Reference the task id, e.g. INFRA-2.5. -->

Task: `<TASK-ID>`

## Why
<!-- The reason / context. Link the relevant blueprint or planning doc section. -->

## How (notable decisions)

## Test evidence
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated (if applicable)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green locally

## Checklists
- [ ] No secrets committed
- [ ] Module boundaries respected (no cross-module DB access / deep imports)
- [ ] Docs updated if structure/architecture changed (FINAL_ARCHITECTURE.md is source of truth)
- [ ] Scope = current sprint only (no future-sprint work)
