import { test, expect, type Page } from '@playwright/test'

// =============================================================================
// 割り勘フルフロー E2E
//   新規作成 → 立替明細 x2 → 精算確定（支払待ち）→ 全完了（クローズ）
//
// 実行:
//   npm run test:e2e            (desktop + mobile 両プロジェクト)
//   npm run test:e2e:mobile     (mobile のみ)
// 前提:
//   E2E_BASE_URL に指すDBに、割り勘参加者となるメンバーが 2 名以上シードされていること。
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'https://the-botch.vercel.app'

type WarikanListEvent = {
  id: string
  eventName: string
  status: 'ENTERING' | 'PAYING' | 'CLOSED'
}

type WarikanListResponse = {
  data: WarikanListEvent[]
  nextCursor: string | null
}

// カーソルベースの一覧APIから eventName に一致するイベントIDを検索
async function findWarikanIdByName(page: Page, eventName: string): Promise<string | null> {
  let cursor: string | null = null
  for (let i = 0; i < 5; i++) {
    const url = new URL(`${BASE_URL}/api/warikan`)
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await page.request.get(url.toString())
    if (!res.ok()) return null
    const body = (await res.json()) as WarikanListResponse
    const hit = body.data.find((e) => e.eventName === eventName)
    if (hit) return hit.id
    if (!body.nextCursor) return null
    cursor = body.nextCursor
  }
  return null
}

test.describe('割り勘フルフロー: 作成 → 立替 → 精算 → クローズ', () => {
  // desktop/mobile の各プロジェクトで同時実行される場合の名前衝突を避けるためランダム値を混ぜる
  const eventName = `E2E_割り勘_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let warikanId: string | null = null

  test.afterAll(async ({ browser }) => {
    if (!warikanId) return
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.request.delete(`${BASE_URL}/api/warikan/${warikanId}`).catch(() => {})
    await context.close()
  })

  test('全フロー: 新規作成 → 立替×2 → 精算確定 → 一括完了 → CLOSED', async ({ page }, testInfo) => {
    // ---------------------------------------------------------------------
    // 前提: シードメンバー確認
    // ---------------------------------------------------------------------
    const membersRes = await page.request.get(`${BASE_URL}/api/members`)
    expect(membersRes.ok(), 'メンバー一覧APIが200を返すこと').toBeTruthy()
    const members = (await membersRes.json()) as { id: string; name: string }[]
    if (members.length < 2) {
      test.skip(true, 'seed メンバーが 2 名未満のため割り勘フローを実行できません')
      return
    }
    const participantCount = Math.min(3, members.length)

    // ---------------------------------------------------------------------
    // 1) 割り勘イベント新規作成
    // ---------------------------------------------------------------------
    await page.goto('/warikan/new')
    await expect(page.getByText('新規割り勘')).toBeVisible()

    await page.getByPlaceholder('例: 20260306_テニス').fill(eventName)

    // 参加メンバー: 先頭 N 名を選択（Radix Checkbox）
    const memberCheckboxes = page.locator('button[role="checkbox"]')
    await expect(memberCheckboxes.first()).toBeVisible({ timeout: 10_000 })
    for (let i = 0; i < participantCount; i++) {
      await memberCheckboxes.nth(i).click()
    }

    const saveBtn = page.getByRole('button', { name: '保存する' })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // 一覧にリダイレクトし、作成イベントがカードとして描画される
    await page.waitForURL(/\/warikan(\?.*)?(#.*)?$/, { timeout: 10_000 })
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 })

    // API から ID を確定（詳細ページに遷移するため）
    warikanId = await findWarikanIdByName(page, eventName)
    expect(warikanId, '作成した割り勘の ID が API から取得できること').not.toBeNull()

    // ---------------------------------------------------------------------
    // 2) 詳細ページで ENTERING (明細入力中) を確認
    // ---------------------------------------------------------------------
    await page.goto(`/warikan/${warikanId}`)
    await expect(page.getByText('精算詳細')).toBeVisible()
    await expect(page.locator('main').getByText('明細入力中')).toBeVisible()

    // ---------------------------------------------------------------------
    // 3) 立替明細を 2 件追加
    // ---------------------------------------------------------------------
    async function addExpense(payerIndex: number, amount: string, description: string) {
      // フォームを開く（開いていれば "追加" ボタンが直接見えている想定）
      const openFormBtn = page.getByRole('button', { name: /\+\s*立替を追加/ })
      await expect(openFormBtn).toBeVisible({ timeout: 5_000 })
      await openFormBtn.click()

      // 立替者 Select（ENTERINGステータスの詳細ページで開かれる combobox はこの1つのみ）
      const payerCombobox = page.locator('button[role="combobox"]')
      await expect(payerCombobox).toBeVisible({ timeout: 5_000 })
      await payerCombobox.click()
      await page.locator('[role="option"]').nth(payerIndex).click()

      // 金額（AmountInput）
      await page.getByPlaceholder('金額').fill(amount)

      // 内容
      await page.getByPlaceholder('内容（例: コート代）').fill(description)

      // 対象者はデフォルトで全員選択済み → そのまま「追加」を押下
      const addBtn = page.getByRole('button', { name: '追加', exact: true })
      await expect(addBtn).toBeEnabled({ timeout: 5_000 })
      await addBtn.click()

      // フォームが閉じ、明細行に内容が現れる
      await expect(page.getByText(description)).toBeVisible({ timeout: 5_000 })
    }

    await addExpense(0, '3000', 'E2E立替_コート代')
    // 2 件目は別の立替者を選び、精算が確実に発生するようにする
    await addExpense(1 % participantCount, '1500', 'E2E立替_ドリンク')

    // 合計金額（¥4,500）がどこかに表示される
    await expect(page.getByText('¥4,500').first()).toBeVisible({ timeout: 5_000 })

    // ---------------------------------------------------------------------
    // 4) ENTERING → PAYING（精算を確定する）
    // ---------------------------------------------------------------------
    const confirmSettlementBtn = page.getByRole('button', { name: '精算を確定する' })
    await expect(confirmSettlementBtn).toBeEnabled({ timeout: 5_000 })
    await confirmSettlementBtn.click()

    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: '確定' }).click()

    // ステータスバッジが 支払待ち に更新される
    await expect(page.locator('main').getByText('支払待ち').first()).toBeVisible({ timeout: 10_000 })

    // ---------------------------------------------------------------------
    // 5) PAYING → CLOSED（全ての精算を一括完了）
    // ---------------------------------------------------------------------
    // PAYING 状態では「全て完了にする」ボタン（AlertDialogTrigger）が現れる
    const bulkTrigger = page.getByRole('button', { name: '全て完了にする' }).first()
    await expect(bulkTrigger).toBeVisible({ timeout: 10_000 })
    await bulkTrigger.click()

    const bulkDialog = page.getByRole('alertdialog')
    await expect(bulkDialog).toBeVisible()
    // ダイアログ内の「全て完了にする」アクションボタンをクリック
    await bulkDialog.getByRole('button', { name: '全て完了にする' }).click()

    // ステータスバッジが クローズ に更新される
    await expect(page.locator('main').getByText('クローズ').first()).toBeVisible({ timeout: 10_000 })

    // ---------------------------------------------------------------------
    // 6) 最終検証: API 経由でも CLOSED であることを保証
    // ---------------------------------------------------------------------
    const detailRes = await page.request.get(`${BASE_URL}/api/warikan/${warikanId}`)
    expect(detailRes.ok()).toBeTruthy()
    const detail = (await detailRes.json()) as { status: string }
    expect(detail.status, 'API で取得したステータスも CLOSED であること').toBe('CLOSED')

    // モバイルビューポートで実行された場合、精算詳細セクションが画面に表示されていることを軽く確認
    const viewportWidth = page.viewportSize()?.width ?? 1280
    if (viewportWidth < 768) {
      await expect(page.locator('main').getByText('精算詳細')).toBeVisible()
      // 参加者チップが折り返しで表示されている（overflow なし）
      await expect(page.locator('main').getByText(eventName)).toBeVisible()
    }

    testInfo.annotations.push({
      type: 'warikan-id',
      description: warikanId ?? '(unknown)',
    })
  })
})
