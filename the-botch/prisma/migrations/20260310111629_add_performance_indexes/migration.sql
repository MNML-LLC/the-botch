-- CreateIndex
CREATE INDEX "event_participants_member_id_idx" ON "event_participants"("member_id");

-- CreateIndex
CREATE INDEX "otokogi_participants_member_id_idx" ON "otokogi_participants"("member_id");

-- CreateIndex
CREATE INDEX "warikan_events_created_at_idx" ON "warikan_events"("created_at");

-- CreateIndex
CREATE INDEX "warikan_expense_debtors_member_id_idx" ON "warikan_expense_debtors"("member_id");

-- CreateIndex
CREATE INDEX "warikan_expenses_warikan_event_id_idx" ON "warikan_expenses"("warikan_event_id");

-- CreateIndex
CREATE INDEX "warikan_expenses_payer_id_idx" ON "warikan_expenses"("payer_id");

-- CreateIndex
CREATE INDEX "warikan_settlements_from_member_id_idx" ON "warikan_settlements"("from_member_id");

-- CreateIndex
CREATE INDEX "warikan_settlements_to_member_id_idx" ON "warikan_settlements"("to_member_id");
