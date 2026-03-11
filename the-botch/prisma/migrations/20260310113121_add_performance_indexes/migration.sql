-- CreateIndex
CREATE INDEX "events_end_date_idx" ON "events"("end_date");

-- CreateIndex
CREATE INDEX "events_created_by_id_idx" ON "events"("created_by_id");

-- CreateIndex
CREATE INDEX "members_is_active_idx" ON "members"("is_active");

-- CreateIndex
CREATE INDEX "otokogi_events_event_id_idx" ON "otokogi_events"("event_id");

-- CreateIndex
CREATE INDEX "warikan_events_manager_id_idx" ON "warikan_events"("manager_id");

-- CreateIndex
CREATE INDEX "warikan_events_event_id_idx" ON "warikan_events"("event_id");

-- CreateIndex
CREATE INDEX "warikan_events_detail_deadline_idx" ON "warikan_events"("detail_deadline");

-- CreateIndex
CREATE INDEX "warikan_events_payment_deadline_idx" ON "warikan_events"("payment_deadline");

-- CreateIndex
CREATE INDEX "warikan_participants_member_id_idx" ON "warikan_participants"("member_id");
