import { test, expect } from '@playwright/test'

// =============================================================================
// E2E: 男気イベント登録フロー
// フロー: /otokogi/new でフォーム入力 → 保存 → /otokogi 一覧の最上位に表示確認
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'https://the-botch.vercel.app'

test.describe('男気イベント登録フロー', () => {
  // タイムスタンプで一意性を確保（並列実行やリトライで衝突しないように）
  const uniqueSuffix = `${Date.now()}`
  const testEventName = `E2E_男気登録_${uniqueSuffix}`
  const testPlace = `E2E場所_${uniqueSuffix}`
  const testAmount = 12345

  // 未来日付（今日 + 60日）を使うことで、eventDate desc ソートで確実に一覧の最上位に来る
  const future = new Date()
  future.setDate(future.getDate() + 60)
  const testEventDate = future.toISOString().slice(0, 10)

  // 作成後のクリーンアップ用ID
  let createdOtokogiId: string | null = null

  test('フォーム入力 → 保存 → 一覧の最上位に作成イベントが表示される', async ({ page }) => {
    // 1. 新規作成ページに遷移
    await page.goto('/otokogi/new')
    await expect(page.getByRole('heading', { name: '男気を記録する' })).toBeVisible()

    // メンバー・イベント読み込み完了を待つ
    await page.waitForTimeout(2000)

    // 2. 日付入力（未来日付で一覧最上位に来ることを保証）
    const dateInput = page.locator('input[type="date"]').first()
    await dateInput.fill(testEventDate)
    await expect(dateInput).toHaveValue(testEventDate)

    // 3. 場所入力
    await page.getByPlaceholder('例: 中目黒').fill(testPlace)

    // 4. イベント・店名入力
    await page.getByPlaceholder('例: chapter').fill(testEventName)

    // 5. 奢った人（payer）を選択：先頭のラジオボタンをクリック
    const payerLabels = page
      .locator('label')
      .filter({ has: page.locator('input[type="radio"][name="payer"]') })
    await expect(payerLabels.first()).toBeVisible()
    await payerLabels.first().click()

    // 6. 支払額入力（AmountInput は placeholder="0"）
    await page.getByPlaceholder('0').fill(String(testAmount))

    // 7. 参加者を全員選択（ParticipantSelector の「全員選択」ボタン）
    const selectAllBtn = page.getByRole('button', { name: '全員選択' })
    await expect(selectAllBtn).toBeEnabled()
    await selectAllBtn.click()

    // 期待値プレビューが表示される（金額 > 0 かつ参加者 >= 1 で描画される）
    await expect(page.getByText('期待値（1人あたり）')).toBeVisible({ timeout: 3000 })

    // 8. 登録ボタンを押下
    const submitBtn = page.getByRole('button', { name: '登録する' })
    await expect(submitBtn).toBeEnabled({ timeout: 3000 })
    await submitBtn.click()

    // 9. 編集ページ (/otokogi/{id}/edit) へリダイレクトされる
    await page.waitForURL(/\/otokogi\/[^/]+\/edit/, { timeout: 10000 })

    // 10. 一覧に戻って最上位カードに作成イベントが表示されることを確認
    await page.goto('/otokogi')
    // 一覧カード: <div className="bg-white rounded-lg p-3 border shadow-sm">
    const eventCards = page.locator('main div.bg-white.rounded-lg.p-3.border.shadow-sm')
    // レンダリング完了を待つ
    await expect(eventCards.first()).toBeVisible({ timeout: 10000 })

    const topCard = eventCards.first()
    await expect(topCard).toContainText(testEventName)
    await expect(topCard).toContainText(testPlace)
    await expect(topCard).toContainText(`¥${testAmount.toLocaleString()}`)

    // API から作成された ID を取得してクリーンアップ用に記録
    const res = await page.request.get(`${BASE_URL}/api/otokogi`)
    if (res.ok()) {
      const body = await res.json()
      const list: Array<{ id: string; eventName: string }> = Array.isArray(body)
        ? body
        : (body?.data ?? [])
      const created = list.find((e) => e.eventName === testEventName)
      if (created) createdOtokogiId = created.id
    }
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    // ID がまだ取れていない場合（テスト失敗時など）は名前で再検索
    if (!createdOtokogiId) {
      const res = await page.request.get(`${BASE_URL}/api/otokogi`).catch(() => null)
      if (res && res.ok()) {
        const body = await res.json()
        const list: Array<{ id: string; eventName: string }> = Array.isArray(body)
          ? body
          : (body?.data ?? [])
        const found = list.find((e) => e.eventName === testEventName)
        if (found) createdOtokogiId = found.id
      }
    }

    if (createdOtokogiId) {
      await page.request
        .delete(`${BASE_URL}/api/otokogi/${createdOtokogiId}`)
        .catch(() => {})
    }
    await context.close()
  })
})
