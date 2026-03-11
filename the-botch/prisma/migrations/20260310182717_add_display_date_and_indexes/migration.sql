-- AlterTable
ALTER TABLE "warikan_events" ADD COLUMN     "display_date" DATE;

-- CreateIndex
CREATE INDEX "otokogi_events_event_date_payer_id_idx" ON "otokogi_events"("event_date", "payer_id");

-- CreateIndex
CREATE INDEX "warikan_events_display_date_idx" ON "warikan_events"("display_date");

-- CreateIndex
CREATE INDEX "warikan_events_status_created_at_idx" ON "warikan_events"("status", "created_at" DESC);
