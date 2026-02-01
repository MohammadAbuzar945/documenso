-- DropIndex
DROP INDEX "Subscription_planId_key";

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_priceId_idx" ON "Subscription"("priceId");
