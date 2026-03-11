-- DropIndex
DROP INDEX "members_is_active_idx";

-- CreateIndex
CREATE INDEX "members_is_active_name_idx" ON "members"("is_active", "name");
