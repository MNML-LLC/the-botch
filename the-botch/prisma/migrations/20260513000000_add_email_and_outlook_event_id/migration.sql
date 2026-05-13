-- AlterTable: Member に email カラム追加 (Outlook 同期用)
ALTER TABLE "members" ADD COLUMN "email" TEXT;

-- CreateIndex: email の一意制約
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- AlterTable: events に outlook_event_id カラム追加 (MS Graph イベント ID 保存用)
ALTER TABLE "events" ADD COLUMN "outlook_event_id" VARCHAR(500);
