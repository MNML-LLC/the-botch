import { test, expect } from '@playwright/test'

// =============================================================================
// E2E (Issue #336, #391): /otokogi 統計タブのチャート表示確認。
// Issue #391 (B5) で「前月・前年度比較」セクションは削除されたため assert から外す。
// 本番 the-botch.vercel.app でタイトルが見えるかだけを確認するスモークテスト。
// =============================================================================

test.describe('男気統計 - 追加チャート（モバイル）', () => {
  test('ヒートマップ / カテゴリ別 / 年次累積 / Top3 のセクションが表示される', async ({ page }) => {
    await page.goto('/otokogi/stats')

    // 画面上に 4 セクションのタイトルが現れること
    await expect(page.getByText('ヒートマップ')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('カテゴリ別支払分布')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('年次累積推移')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('直近 3ヶ月の男気')).toBeVisible({ timeout: 15000 })
  })
})
