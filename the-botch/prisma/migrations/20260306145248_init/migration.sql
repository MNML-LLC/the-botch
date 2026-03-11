-- CreateEnum
CREATE TYPE "warikan_status" AS ENUM ('明細入力中', '支払待ち', 'クローズ');

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "initial" CHAR(1) NOT NULL,
    "color_bg" TEXT NOT NULL DEFAULT 'bg-gray-100',
    "color_text" TEXT NOT NULL DEFAULT 'text-gray-700',
    "paypay_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otokogi_events" (
    "id" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "event_name" VARCHAR(100) NOT NULL,
    "payer_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "place" VARCHAR(100),
    "has_album" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otokogi_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otokogi_participants" (
    "otokogi_event_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,

    CONSTRAINT "otokogi_participants_pkey" PRIMARY KEY ("otokogi_event_id","member_id")
);

-- CreateTable
CREATE TABLE "warikan_events" (
    "id" TEXT NOT NULL,
    "event_name" VARCHAR(200) NOT NULL,
    "status" "warikan_status" NOT NULL DEFAULT '明細入力中',
    "detail_deadline" DATE,
    "payment_deadline" DATE,
    "memo" TEXT,
    "manager_id" TEXT,
    "walica_url" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warikan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warikan_participants" (
    "warikan_event_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,

    CONSTRAINT "warikan_participants_pkey" PRIMARY KEY ("warikan_event_id","member_id")
);

-- CreateTable
CREATE TABLE "warikan_expenses" (
    "id" TEXT NOT NULL,
    "warikan_event_id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warikan_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warikan_settlements" (
    "id" TEXT NOT NULL,
    "warikan_event_id" TEXT NOT NULL,
    "from_member_id" TEXT NOT NULL,
    "to_member_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "is_received" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warikan_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_name_key" ON "members"("name");

-- CreateIndex
CREATE INDEX "otokogi_events_event_date_idx" ON "otokogi_events"("event_date" DESC);

-- CreateIndex
CREATE INDEX "otokogi_events_payer_id_idx" ON "otokogi_events"("payer_id");

-- CreateIndex
CREATE INDEX "warikan_events_status_idx" ON "warikan_events"("status");

-- CreateIndex
CREATE INDEX "warikan_settlements_warikan_event_id_idx" ON "warikan_settlements"("warikan_event_id");

-- AddForeignKey
ALTER TABLE "otokogi_events" ADD CONSTRAINT "otokogi_events_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otokogi_participants" ADD CONSTRAINT "otokogi_participants_otokogi_event_id_fkey" FOREIGN KEY ("otokogi_event_id") REFERENCES "otokogi_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otokogi_participants" ADD CONSTRAINT "otokogi_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_events" ADD CONSTRAINT "warikan_events_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_participants" ADD CONSTRAINT "warikan_participants_warikan_event_id_fkey" FOREIGN KEY ("warikan_event_id") REFERENCES "warikan_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_participants" ADD CONSTRAINT "warikan_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_expenses" ADD CONSTRAINT "warikan_expenses_warikan_event_id_fkey" FOREIGN KEY ("warikan_event_id") REFERENCES "warikan_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_expenses" ADD CONSTRAINT "warikan_expenses_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_settlements" ADD CONSTRAINT "warikan_settlements_warikan_event_id_fkey" FOREIGN KEY ("warikan_event_id") REFERENCES "warikan_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_settlements" ADD CONSTRAINT "warikan_settlements_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_settlements" ADD CONSTRAINT "warikan_settlements_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
