-- CreateTable
CREATE TABLE "otokogi_images" (
    "id" TEXT NOT NULL,
    "otokogi_event_id" TEXT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otokogi_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otokogi_images_otokogi_event_id_idx" ON "otokogi_images"("otokogi_event_id");

-- AddForeignKey
ALTER TABLE "otokogi_images" ADD CONSTRAINT "otokogi_images_otokogi_event_id_fkey" FOREIGN KEY ("otokogi_event_id") REFERENCES "otokogi_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
