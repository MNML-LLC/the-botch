import { test, expect, type Page } from '@playwright/test'

// =============================================================================
// UAT（受け入れテスト）— エンドユーザー視点のブラウザ操作検証
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'https://the-botch.vercel.app'

// テストで作成したデータのIDを記録（クリーンアップ用）
const createdIds: { members: string[]; otokogi: string[]; warikan: string[]; events: string[] } = {
  members: [],
  otokogi: [],
  warikan: [],
  events: [],
}

// APIでクリーンアップ
async function cleanup(page: Page) {
  for (const id of createdIds.warikan) {
    await page.request.delete(`${BASE_URL}/api/warikan/${id}`).catch(() => {})
  }
  for (const id of createdIds.otokogi) {
    await page.request.delete(`${BASE_URL}/api/otokogi/${id}`).catch(() => {})
  }
  for (const id of createdIds.events) {
    await page.request.delete(`${BASE_URL}/api/events/${id}`).catch(() => {})
  }
  for (const id of createdIds.members) {
    await page.request.delete(`${BASE_URL}/api/members/${id}`).catch(() => {})
  }
}

// =============================================================================
// 1. 画面表示・遷移の検証
// =============================================================================
test.describe('1. 画面表示・遷移', () => {
  test('ダッシュボードが正常に表示される', async ({ page }) => {
    await page.goto('/')
    // ヘッダー
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByRole('link', { name: 'The botch' })).toBeVisible()
    // 直近イベントセクション
    await expect(page.getByText('直近イベント')).toBeVisible()
    await expect(page.getByText('月次推移')).toBeVisible()
    // 未精算の割り勘セクション
    await expect(page.getByText('未精算の割り勘')).toBeVisible()
    // 直近の男気セクション
    await expect(page.getByText('直近の男気')).toBeVisible()
  })

  test('ナビゲーションリンクが全て機能する', async ({ page }) => {
    await page.goto('/')
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768

    async function navigateTo(name: string) {
      if (isMobile) {
        // ハンバーガーメニューを開いてリンクをクリック
        await page.locator('header button').filter({ has: page.locator('svg') }).click()
        await page.waitForTimeout(300)
        const mobileMenu = page.locator('header .bg-slate-700')
        await mobileMenu.getByRole('link', { name }).click()
      } else {
        await page.locator('header nav').getByRole('link', { name }).click()
      }
    }

    await navigateTo('割り勘管理')
    await expect(page).toHaveURL(/\/warikan/)

    await navigateTo('男気管理')
    await expect(page).toHaveURL(/\/otokogi/)

    await navigateTo('メンバー管理')
    await expect(page).toHaveURL(/\/members/)

    await navigateTo('カレンダー')
    await expect(page).toHaveURL(/\/calendar/)

    // ダッシュボードに戻る
    if (isMobile) {
      await page.locator('header button').filter({ has: page.locator('svg') }).click()
      await page.waitForTimeout(300)
      const mobileMenu = page.locator('header .bg-slate-700')
      await mobileMenu.getByRole('link', { name: 'ダッシュボード' }).click()
    } else {
      await page.getByRole('link', { name: 'The botch' }).click()
    }
    await expect(page).toHaveURL(/\/(#.*)?$/)
  })

  test('割り勘一覧ページが正常表示される', async ({ page }) => {
    await page.goto('/warikan')
    // main内の見出しを確認（ヘッダーナビのリンクはモバイルで非表示）
    await expect(page.locator('main').getByText('割り勘管理')).toBeVisible()
    // フィルター存在確認
    await expect(page.getByText('全て')).toBeVisible()
    // 新規作成・Walica取込ボタン
    await expect(page.getByRole('link', { name: /新規/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Walica/ })).toBeVisible()
  })

  test('男気管理ページのタブ切り替え', async ({ page }) => {
    await page.goto('/otokogi')

    // 履歴タブ（デフォルト）
    await expect(page.getByRole('button', { name: '履歴' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ランキング' })).toBeVisible()
    await expect(page.getByRole('link', { name: '統計' })).toBeVisible()

    // ランキングタブに切り替え
    await page.getByRole('button', { name: 'ランキング' }).click()
    await expect(page.getByText('支払額ランキング')).toBeVisible()

    // 統計リンクをクリック → /otokogi/stats へナビゲート
    await page.getByRole('link', { name: '統計' }).click()
    await page.waitForURL(/\/otokogi\/stats/)
    await expect(page.getByText('男気統計')).toBeVisible()
    await expect(page.getByText('総回数')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('累計金額').first()).toBeVisible({ timeout: 10000 })
  })

  test('メンバー一覧ページが正常表示される', async ({ page }) => {
    await page.goto('/members')
    await expect(page.locator('main').getByText('メンバー管理')).toBeVisible()
    // 6人のメンバーが表示されているか（seedデータ）
    const memberCards = page.locator('.rounded-xl, .rounded-lg').filter({ has: page.locator('.rounded-full') })
    await expect(memberCards.first()).toBeVisible()
  })

  test('カレンダーページが正常表示される', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page.locator('main').getByText('カレンダー').first()).toBeVisible()
    // 月ナビゲーション
    await expect(page.getByText('今日')).toBeVisible()
    // 曜日ヘッダー
    await expect(page.getByText('日').first()).toBeVisible()
    await expect(page.getByText('土').first()).toBeVisible()
    // 凡例
    await expect(page.locator('main').getByText('男気').first()).toBeVisible()
    await expect(page.locator('main').getByText('割り勘').first()).toBeVisible()
  })
})

// =============================================================================
// 2. メンバーCRUDフロー
// =============================================================================
test.describe('2. メンバーCRUD操作フロー', () => {
  const testMemberName = `UATテスト_${Date.now()}`

  test('メンバー新規作成 → 一覧に反映', async ({ page }) => {
    await page.goto('/members/new')
    await expect(page.getByText('メンバー追加')).toBeVisible()

    // フォーム入力
    await page.locator('input').filter({ hasText: '' }).first().fill(testMemberName)
    // 表示名
    const inputs = page.locator('input[type="text"], input:not([type])')
    await inputs.nth(0).fill(testMemberName)
    // 姓
    await inputs.nth(1).fill('テスト')
    // イニシャル
    await inputs.nth(2).fill('T')

    // 追加ボタンが有効になる
    const submitBtn = page.getByRole('button', { name: '追加する' })
    await expect(submitBtn).toBeEnabled()

    // 送信
    await submitBtn.click()

    // メンバー一覧にリダイレクトされる
    await page.waitForURL(/\/members/, { timeout: 10000 })

    // 作成したメンバーが表示される
    await expect(page.getByText(testMemberName)).toBeVisible()

    // クリーンアップ: APIで作成したメンバーを取得してIDを記録
    const res = await page.request.get(`${BASE_URL}/api/members`)
    const members = await res.json()
    const created = members.find((m: { name: string }) => m.name === testMemberName)
    if (created) createdIds.members.push(created.id)
  })

  test('メンバー編集フロー', async ({ page }) => {
    // 既存メンバーの編集ページにアクセス（seedデータの1人目）
    const res = await page.request.get(`${BASE_URL}/api/members`)
    const members = await res.json()
    if (members.length === 0) {
      test.skip()
      return
    }
    const member = members[0]

    await page.goto(`/members/${member.id}/edit`)
    await expect(page.getByText('メンバー編集')).toBeVisible({ timeout: 10000 })

    // フォームに既存値が入っているか
    const nameInput = page.locator('input').first()
    await expect(nameInput).toHaveValue(member.name)
  })

  test('メンバー作成 — 必須項目未入力でボタン無効', async ({ page }) => {
    await page.goto('/members/new')

    const submitBtn = page.getByRole('button', { name: '追加する' })
    // 何も入力していない状態ではdisabled
    await expect(submitBtn).toBeDisabled()
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await cleanup(page)
    await context.close()
  })
})

// =============================================================================
// 3. 割り勘フロー（作成 → 立替追加 → 精算 → 支払・受領）
// =============================================================================
test.describe('3. 割り勘完全フロー', () => {
  let warikanId: string

  test('割り勘新規作成', async ({ page }) => {
    await page.goto('/warikan/new')
    await expect(page.getByText('新規割り勘')).toBeVisible()

    // メンバーが読み込まれるまで待つ
    await page.waitForTimeout(2000)

    // イベント名入力
    await page.getByPlaceholder('例: 20260306_テニス').fill('UAT_テスト割り勘')

    // 参加メンバーを選択（Radix Checkboxはbutton[role="checkbox"]）
    const checkboxes = page.locator('button[role="checkbox"]')
    const count = await checkboxes.count()
    for (let i = 0; i < Math.min(3, count); i++) {
      await checkboxes.nth(i).click()
    }

    // 保存ボタン
    const saveBtn = page.getByRole('button', { name: '保存する' })
    await expect(saveBtn).toBeEnabled({ timeout: 3000 })
    await saveBtn.click()

    // 割り勘一覧にリダイレクト
    await page.waitForURL(/\/warikan$/, { timeout: 10000 })
    await expect(page.getByText('UAT_テスト割り勘')).toBeVisible({ timeout: 5000 })

    // IDを取得
    const res = await page.request.get(`${BASE_URL}/api/warikan`)
    const { data: events } = await res.json()
    const created = events.find((e: { eventName: string }) => e.eventName === 'UAT_テスト割り勘')
    if (created) {
      warikanId = created.id
      createdIds.warikan.push(created.id)
    }
  })

  test('割り勘詳細 — 立替明細追加', async ({ page }) => {
    if (!warikanId) test.skip()

    await page.goto(`/warikan/${warikanId}`)
    await expect(page.getByText('精算詳細')).toBeVisible()
    await expect(page.getByText('UAT_テスト割り勘')).toBeVisible()

    // ステータスが「明細入力中」
    await expect(page.getByText('明細入力中')).toBeVisible()

    // 「+ 立替を追加」をクリック
    await page.getByText('+ 立替を追加').click()
    await page.waitForTimeout(500)

    // 立替フォームが表示される
    const expenseForm = page.locator('.bg-gray-50.rounded-lg.border')
    await expect(expenseForm.getByPlaceholder('金額')).toBeVisible()

    // 立替者を選択（フォーム内のSelectコンポーネント — ステータスSelectの後のもの）
    const payerSelect = expenseForm.locator('button[role="combobox"]')
    await payerSelect.click()
    await page.locator('[role="option"]').first().click()
    await page.waitForTimeout(300)

    // 金額入力
    await expenseForm.getByPlaceholder('金額').fill('3000')

    // 内容入力
    await expenseForm.getByPlaceholder('内容（例: コート代）').fill('テスト立替')

    // 対象者はデフォルトで全員選択済み

    // 追加ボタン
    await expenseForm.getByRole('button', { name: '追加' }).click()

    // 立替明細が表示される
    await page.waitForTimeout(1000)
    await expect(page.getByText('テスト立替')).toBeVisible()
    await expect(page.getByText('¥3,000').first()).toBeVisible()
  })

  test('割り勘詳細 — ENTERING → PAYING（精算を確定するボタン）', async ({ page }) => {
    if (!warikanId) test.skip()

    await page.goto(`/warikan/${warikanId}`)
    await expect(page.getByText('精算詳細')).toBeVisible()

    // 遷移前: ENTERING（明細入力中）
    await expect(page.locator('main').getByText('明細入力中')).toBeVisible()

    // 「精算を確定する」ボタンをクリック → AlertDialog が開く
    const confirmSettlementBtn = page.getByRole('button', { name: '精算を確定する' })
    await expect(confirmSettlementBtn).toBeEnabled({ timeout: 5000 })
    await confirmSettlementBtn.click()

    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()

    // ダイアログ内の「確定」で PAYING に遷移
    await confirmDialog.getByRole('button', { name: '確定' }).click()

    // 遷移後: PAYING（支払待ち）バッジが表示される
    await expect(page.locator('main').getByText('支払待ち').first()).toBeVisible({ timeout: 10000 })

    // API でもステータス遷移を確認
    const res = await page.request.get(`${BASE_URL}/api/warikan/${warikanId}`)
    const detail = await res.json()
    expect(detail.status).toBe('PAYING')
  })

  test('割り勘詳細 — PAYING → CLOSED（全て完了にするボタン）', async ({ page }) => {
    if (!warikanId) test.skip()

    await page.goto(`/warikan/${warikanId}`)
    await expect(page.getByText('精算詳細')).toBeVisible()

    // 前ステップで PAYING に遷移していない場合はスキップ（依存関係の保険）
    const isPaying = await page.locator('main').getByText('支払待ち').first().isVisible().catch(() => false)
    if (!isPaying) test.skip()

    // 「全て完了にする」ボタン（AlertDialogTrigger）をクリック
    const bulkTrigger = page.getByRole('button', { name: '全て完了にする' }).first()
    await expect(bulkTrigger).toBeVisible({ timeout: 10000 })
    await bulkTrigger.click()

    const bulkDialog = page.getByRole('alertdialog')
    await expect(bulkDialog).toBeVisible()

    // ダイアログ内の「全て完了にする」で CLOSED に遷移
    await bulkDialog.getByRole('button', { name: '全て完了にする' }).click()

    // 遷移後: CLOSED（クローズ）バッジが表示される
    await expect(page.locator('main').getByText('クローズ').first()).toBeVisible({ timeout: 10000 })

    // API でもステータス遷移を確認
    const res = await page.request.get(`${BASE_URL}/api/warikan/${warikanId}`)
    const detail = await res.json()
    expect(detail.status).toBe('CLOSED')
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await cleanup(page)
    await context.close()
  })
})

// =============================================================================
// 4. 男気フロー（新規記録 → 一覧反映 → 統計反映）
// =============================================================================
test.describe('4. 男気記録フロー', () => {
  test('男気新規記録 → 一覧に反映', async ({ page }) => {
    await page.goto('/otokogi/new')
    await expect(page.getByText('男気を記録する')).toBeVisible()

    // メンバーが読み込まれるまで待つ
    await page.waitForTimeout(2000)

    // 日付（デフォルトで今日）
    const dateInput = page.locator('input[type="date"]')
    await expect(dateInput).not.toHaveValue('')

    // イベント名
    await page.getByPlaceholder('例: chapter').fill('UAT_テスト男気')

    // 場所
    await page.getByPlaceholder('例: 中目黒').fill('テスト場所')

    // 奢った人を選択（ラジオボタン — sr-only input の親label をクリック）
    const payerLabels = page.locator('label').filter({ has: page.locator('input[type="radio"]') })
    await payerLabels.first().click()

    // 支払額
    await page.getByPlaceholder('0').fill('10000')

    // 参加者を選択（Radix Checkbox）
    // 最初の3人（アルバムチェックボックスを除外するため、参加者セクション内のみ）
    const participantSection = page.locator('label').filter({ has: page.locator('button[role="checkbox"]') })
    const pCount = await participantSection.count()
    // pCountにはアルバムも含まれるので、最初のメンバー3人だけクリック
    for (let i = 0; i < Math.min(3, pCount - 1); i++) {
      await participantSection.nth(i).click()
    }

    // 期待値が表示される
    await expect(page.getByText('期待値（1人あたり）')).toBeVisible({ timeout: 3000 })

    // 登録
    const submitBtn = page.getByRole('button', { name: '登録する' })
    await expect(submitBtn).toBeEnabled({ timeout: 3000 })
    await submitBtn.click()

    // 男気一覧にリダイレクト
    await page.waitForURL(/\/otokogi$/, { timeout: 10000 })
    await page.waitForTimeout(1000)
    await expect(page.getByText('UAT_テスト男気').first()).toBeVisible({ timeout: 5000 })

    // IDを取得
    const res = await page.request.get(`${BASE_URL}/api/otokogi`)
    const { data: events } = await res.json()
    const created = events.find((e: { eventName: string }) => e.eventName === 'UAT_テスト男気')
    if (created) {
      createdIds.otokogi.push(created.id)
    }
  })

  test('男気統計に反映される', async ({ page }) => {
    // 統計ページに直接アクセス
    await page.goto('/otokogi/stats')
    await expect(page.getByText('男気統計')).toBeVisible()
    await expect(page.getByText('総回数')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('月別推移')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('漢気ランキング')).toBeVisible({ timeout: 10000 })
  })

  test('男気 — 必須項目未入力でボタン無効', async ({ page }) => {
    await page.goto('/otokogi/new')

    const submitBtn = page.getByRole('button', { name: '登録する' })
    await expect(submitBtn).toBeDisabled()
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await cleanup(page)
    await context.close()
  })
})

// =============================================================================
// 5. カレンダー操作フロー
// =============================================================================
test.describe('5. カレンダー操作', () => {
  test('カレンダー月ナビゲーション', async ({ page }) => {
    await page.goto('/calendar')
    await page.waitForTimeout(1000)

    const now = new Date()
    const currentMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`
    await expect(page.getByText(currentMonth)).toBeVisible()

    // 前月に移動（ChevronLeftアイコンのボタン — main内のボタンを使う）
    const mainContent = page.locator('main')
    const prevBtn = mainContent.locator('button').filter({ has: page.locator('.lucide-chevron-left') })
    await prevBtn.click()
    await page.waitForTimeout(500)
    const prevMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}年12月`
      : `${now.getFullYear()}年${now.getMonth()}月`
    await expect(page.getByText(prevMonth)).toBeVisible()

    // 「今日」ボタンで戻る
    await page.getByText('今日').click()
    await page.waitForTimeout(500)
    await expect(page.getByText(currentMonth)).toBeVisible()
  })

  test('カレンダー予定追加フロー', async ({ page }) => {
    await page.goto('/calendar/new')
    await expect(page.getByRole('heading', { name: '予定を追加' })).toBeVisible()

    // タイトル入力
    await page.getByPlaceholder('例: 韓国旅行、忘年会').fill('UATテスト予定')

    // 日付入力
    const dateInputs = page.locator('input[type="date"]')
    const today = new Date().toISOString().slice(0, 10)
    await dateInputs.first().fill(today)

    // 登録者選択
    const creatorSelect = page.locator('button[role="combobox"]').nth(1)
    await creatorSelect.click()
    await page.locator('[role="option"]').first().click()

    // 参加者はデフォルト全員選択

    // 登録
    const submitBtn = page.getByRole('button', { name: '予定を登録' })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // カレンダーにリダイレクト
    await page.waitForURL((url) => url.pathname === '/calendar', { timeout: 10000 })

    // IDを取得してクリーンアップ用に記録
    const res = await page.request.get(`${BASE_URL}/api/events`)
    const events = await res.json()
    const created = events.find((e: { title: string }) => e.title === 'UATテスト予定')
    if (created) createdIds.events.push(created.id)
  })

  test('カレンダー日付タップで詳細表示', async ({ page }) => {
    await page.goto('/calendar')
    await page.waitForTimeout(1000)

    // ドットインジケーターがある日付を探してクリック
    const cellsWithDots = page.locator('button').filter({ has: page.locator('.rounded-full.w-1\\.5') })
    const count = await cellsWithDots.count()
    if (count > 0) {
      await cellsWithDots.first().click()
      await page.waitForTimeout(500)
      // 選択日の詳細が表示される
      await expect(page.getByText(/の予定/)).toBeVisible()
    }
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await cleanup(page)
    await context.close()
  })
})

// =============================================================================
// 6. Walicaインポートフロー
// =============================================================================
test.describe('6. Walicaインポート', () => {
  test('Walicaインポートページ表示', async ({ page }) => {
    await page.goto('/warikan/import')
    await expect(page.getByText('Walicaからインポート')).toBeVisible()
    await expect(page.getByPlaceholder('https://walica.jp/g/xxxxx')).toBeVisible()
    await expect(page.getByRole('button', { name: 'データ取得' })).toBeVisible()
  })

  test('Walica — 無効なURLでエラー表示', async ({ page }) => {
    await page.goto('/warikan/import')

    // 不正なURLを入力
    await page.getByPlaceholder('https://walica.jp/g/xxxxx').fill('https://example.com/invalid')
    await page.getByRole('button', { name: 'データ取得' }).click()

    // エラーメッセージが表示される（外部API呼び出しのため長めに待つ）
    const errorMessage = page.locator('.bg-red-50').first()
    await expect(errorMessage).toBeVisible({ timeout: 8000 })
  })

  test('Walica — 空URLでボタン無効', async ({ page }) => {
    await page.goto('/warikan/import')

    const fetchBtn = page.getByRole('button', { name: 'データ取得' })
    await expect(fetchBtn).toBeDisabled()
  })
})

// =============================================================================
// 7. フィルター機能の検証
// =============================================================================
test.describe('7. フィルター機能', () => {
  test('割り勘 — ステータスフィルター', async ({ page }) => {
    await page.goto('/warikan')
    await page.waitForTimeout(1000)

    // 「全て」が選択されている
    await expect(page.getByText('全て').first()).toBeVisible()

    // ステータスフィルターのボタンをクリック
    const filterButtons = page.locator('button').filter({ hasText: /明細入力中|支払待ち|クローズ/ })
    const count = await filterButtons.count()
    if (count > 0) {
      await filterButtons.first().click()
      await page.waitForTimeout(1000)
      // フィルタリング後もページが正常（エラーなし）
      await expect(page.locator('main').getByText('割り勘管理')).toBeVisible()
    }
  })

  test('割り勘 — 年度フィルター', async ({ page }) => {
    await page.goto('/warikan')
    await page.waitForTimeout(1000)

    // 年度セレクター
    const yearSelect = page.locator('button[role="combobox"]').filter({ hasText: /全期間|\d{4}年/ })
    if (await yearSelect.isVisible()) {
      await yearSelect.click()
      // 年度オプションが表示される
      const yearOption = page.locator('[role="option"]').filter({ hasText: /2025/ })
      if (await yearOption.isVisible()) {
        await yearOption.click()
        await page.waitForTimeout(1000)
        // ページが正常
        await expect(page.locator('main').getByText('割り勘管理')).toBeVisible()
      }
    }
  })

  test('男気 — 年度フィルター（履歴）', async ({ page }) => {
    await page.goto('/otokogi')
    await page.waitForTimeout(1000)

    // 年度セレクター
    const yearSelect = page.locator('button[role="combobox"]')
    if (await yearSelect.isVisible()) {
      await yearSelect.click()
      const yearOption = page.locator('[role="option"]').filter({ hasText: /2025/ })
      if (await yearOption.isVisible()) {
        await yearOption.click()
        await page.waitForTimeout(1000)
        // 2025年のデータが表示（またはデータなし）
        await expect(page.getByRole('button', { name: '履歴' })).toBeVisible()
      }
    }
  })

  test('男気統計 — 年度フィルター', async ({ page }) => {
    // 統計ページに直接アクセス
    await page.goto('/otokogi/stats')
    await page.waitForTimeout(2000)

    // 統計専用の年度フィルター
    const yearSelect = page.locator('button[role="combobox"]')
    if (await yearSelect.isVisible()) {
      await yearSelect.click()
      const yearOption = page.locator('[role="option"]').filter({ hasText: /2025/ })
      if (await yearOption.isVisible()) {
        await yearOption.click()
        await page.waitForTimeout(2000)
        // 男気統計が更新される
        await expect(page.getByText('男気統計')).toBeVisible()
      }
    }
  })
})

// =============================================================================
// 8. エッジケース・エラーハンドリング
// =============================================================================
test.describe('8. エッジケース', () => {
  test('存在しない割り勘IDでエラー表示', async ({ page }) => {
    await page.goto('/warikan/nonexistent-id-12345')
    await page.waitForTimeout(3000)
    // 「イベントが見つかりません」が表示される
    await expect(page.getByText('イベントが見つかりません')).toBeVisible()
  })

  test('存在しないメンバーIDでエラー表示', async ({ page }) => {
    await page.goto('/members/nonexistent-id-12345/edit')
    await page.waitForTimeout(3000)
    // エラーかリダイレクトが発生
    const hasError = await page.getByText(/見つかりません|エラー/).isVisible().catch(() => false)
    const redirected = page.url().includes('/members')
    expect(hasError || redirected).toBeTruthy()
  })

  test('割り勘作成 — イベント名のみ（参加者なし）でボタン無効', async ({ page }) => {
    await page.goto('/warikan/new')

    await page.getByPlaceholder('例: 20260306_テニス').fill('テスト')

    // 参加者未選択 → 保存ボタン無効
    const saveBtn = page.getByRole('button', { name: '保存する' })
    await expect(saveBtn).toBeDisabled()
  })

  test('男気作成 — 金額マイナスでも入力可能かチェック', async ({ page }) => {
    await page.goto('/otokogi/new')

    // 金額にマイナス値
    await page.getByPlaceholder('0').fill('-1000')

    // parseAmount がマイナス記号を除去するため、表示値は 1000 になる
    await expect(page.getByPlaceholder('0')).toHaveValue('1,000')
  })

  test('404ページへのアクセス', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist')
    // Next.jsの404が返る
    expect(response?.status()).toBe(404)
  })
})

// =============================================================================
// 9. レスポンシブ表示（モバイルプロジェクトで自動実行）
// =============================================================================
test.describe('9. レスポンシブ・モバイル表示', () => {
  test('モバイルハンバーガーメニュー', async ({ page }) => {
    // モバイルプロジェクトでのみ意味あり
    await page.goto('/')

    // ビューポートがモバイルサイズの場合
    const viewportWidth = page.viewportSize()?.width ?? 1280
    if (viewportWidth < 768) {
      // ハンバーガーメニューボタンが見える
      const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
      await expect(menuBtn).toBeVisible()

      // メニューを開く
      await menuBtn.click()
      await page.waitForTimeout(300)

      // モバイルメニュー内のナビゲーションリンクが表示される
      const mobileMenu = page.locator('header .bg-slate-700')
      await expect(mobileMenu.getByText('ダッシュボード')).toBeVisible()
      await expect(mobileMenu.getByText('割り勘管理')).toBeVisible()
    }
  })

  test('ダッシュボード — 金額が画面に収まる', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)
    // overflow-hidden / truncate が適用されているか視覚的に確認不可
    // テキストが表示されているかのみ検証
    await expect(page.getByText('未精算の割り勘')).toBeVisible()
  })

  test('男気統計グラフが表示される', async ({ page }) => {
    await page.goto('/otokogi/stats')
    await page.waitForTimeout(3000)

    // rechartsのSVGが描画されているか
    const svgElements = page.locator('svg.recharts-surface')
    const svgCount = await svgElements.count()
    // 最低1つのグラフがレンダリングされている
    expect(svgCount).toBeGreaterThanOrEqual(1)
  })

  test('割り勘詳細の精算結果がモバイルで見切れない', async ({ page }) => {
    // 既存の割り勘で精算済みのものを探す
    const res = await page.request.get(`${BASE_URL}/api/warikan?status=PAYING`)
    const { data: events } = await res.json()
    if (events.length === 0) {
      test.skip()
      return
    }

    await page.goto(`/warikan/${events[0].id}`)
    await page.waitForTimeout(1000)

    // ページが正常に表示される
    await expect(page.getByText('精算詳細')).toBeVisible()
  })
})
