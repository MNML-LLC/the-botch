import { test, expect } from '@playwright/test'

// =============================================================================
// E2E (Issue #336): /otokogi/stats に追加した 5 グラフの表示確認（モバイル viewport）
// 本番 the-botch.vercel.app でタイトルが見えるかだけを確認するスモークテスト。
// =============================================================================

test.describe('男気統計 - 追加チャート（モバイル）', () => {
  test('ヒートマップ / カテゴリ別 / 年次累積 / 比較 / Top3 のセクションが表示される', async ({ page }) => {
    await page.goto('/otokogi/stats')

    // 画面上に 5 セクションのタイトルが現れること
    await expect(page.getByText('ヒートマップ')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('カテゴリ別支払分布')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('年次累積推移')).toBeVisible({ timeout: 15000 })
    // D は 2 枚のサブカード (今月 vs 先月 / 今年 vs 昨年) のどちらかが見えればよい
    await expect(page.locator('text=/vs/').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('直近 3ヶ月の男気')).toBeVisible({ timeout: 15000 })
  })
})
