import { redirect } from 'next/navigation';

/**
 * Issue #389: 統計コンテンツを /otokogi の統計タブに統合済み。
 * 直接 URL (/otokogi/stats) でアクセスされた場合は /otokogi?tab=stats に
 * サーバー側で redirect する（ブックマーク・外部リンクの backward compat）。
 */
export default function OtokogiStatsPage() {
  redirect('/otokogi?tab=stats');
}
