-- AddColumn: じゃんけん勝率計算用（既存レコードは全て false 開始、遡及更新は別タスク）
ALTER TABLE "otokogi_events" ADD COLUMN "was_janken" BOOLEAN NOT NULL DEFAULT false;
