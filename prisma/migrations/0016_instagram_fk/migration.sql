-- Sprint 6 M1 — Add FK from leads.instagramAccountId → instagram_accounts.id.
--
-- The column leads.instagramAccountId was added in an earlier migration as a nullable UUID
-- with a comment "deferred FK → instagram_accounts (Sprint 6)". Now that instagram_accounts
-- exists we add the constraint using NOT VALID to avoid a full table scan, then validate.
--
-- ADD CONSTRAINT ... NOT VALID: checks new/updated rows only — no table scan, no lock.
-- VALIDATE CONSTRAINT:          scans existing rows; takes ShareUpdateExclusiveLock (concurrent reads/writes OK).

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_instagram_account_id_fkey"
  FOREIGN KEY ("instagramAccountId") REFERENCES "instagram_accounts"("id")
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE "leads" VALIDATE CONSTRAINT "leads_instagram_account_id_fkey";
