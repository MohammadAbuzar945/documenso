-- Allow organisations to have multiple subscription rows for history purposes.
DROP INDEX IF EXISTS "Subscription_organisationId_key";
DROP INDEX IF EXISTS "Subscription_planId_key";

-- Keep non-unique indexes for lookups.
CREATE INDEX IF NOT EXISTS "Subscription_planId_idx" ON "Subscription"("planId");
