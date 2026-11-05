-- AddColumn: 男気イベントの明示的カテゴリ（null 時は分類ロジックで自動推定 / Issue #410）
-- 既存レコードは null のまま（後方互換、遡及バックフィルは CEO 判断）
ALTER TABLE "otokogi_events" ADD COLUMN "event_type" "event_type";
