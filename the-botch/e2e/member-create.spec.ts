import { test, expect, type Page } from '@playwright/test'

// =============================================================================
// メンバー追加 → 銀行口座登録 → 一覧確認 の E2E フロー (Issue #67)
// 精算に直結する重要フローのため、UI からの入力・保存・表示反映を通しで検証する
// =============================================================================

const BASE_URL = process.env.E2E_BASE_URL || 'https://the-botch.vercel.app'

// テストで作成したメンバーのIDを記録（クリーンアップ用）
const createdMemberIds: string[] = []

async function cleanup(page: Page) {
  for (const id of createdMemberIds) {
    // 口座情報 → メンバーの順で削除（FK制約回避）
    await page.request.delete(`${BASE_URL}/api/members/${id}/bank-account`).catch(() => {})
    await page.request.delete(`${BASE_URL}/api/members/${id}`).catch(() => {})
  }
}

test.describe('メンバー追加 → 銀行口座登録フロー', () => {
  const timestamp = Date.now()
  const memberName = `E2E口座_${timestamp}`
  const bankName = 'E2Eテスト銀行'
  const branchName = 'テスト支店'
  const accountNumber = '1234567'
  const accountHolder = 'テスト タロウ'

  test('1. メンバー新規作成 → メンバー一覧に反映される', async ({ page }) => {
    await page.goto('/members/new')
    await expect(page.getByText('メンバー追加')).toBeVisible()

    // 必須3項目（表示名・姓・イニシャル）の入力
    await page.getByPlaceholder('例: ゆうき').fill(memberName)
    await page.getByPlaceholder('例: 内山').fill('テスト')
    await page.getByPlaceholder('Y').fill('T')

    // 入力完了で「追加する」ボタンが有効化される
    const submitBtn = page.getByRole('button', { name: '追加する' })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // メンバー一覧にリダイレクトされる
    await page.waitForURL(/\/members$/, { timeout: 10000 })

    // 作成したメンバーが一覧に表示される
    await expect(page.getByText(memberName)).toBeVisible({ timeout: 5000 })

    // 後続テスト用に ID を記録
    const res = await page.request.get(`${BASE_URL}/api/members`)
    const members = await res.json()
    const created = members.find((m: { name: string }) => m.name === memberName)
    expect(created, `作成したメンバー "${memberName}" が API で取得できません`).toBeDefined()
    createdMemberIds.push(created.id)
  })

  test('2. 銀行口座情報の入力 → 保存 → API での永続化を確認', async ({ page }) => {
    expect(
      createdMemberIds.length,
      '前段のメンバー作成テストが失敗しているため、口座登録テストをスキップします'
    ).toBeGreaterThan(0)

    const memberId = createdMemberIds[0]
    await page.goto(`/members/${memberId}/edit`)
    await expect(page.getByText('メンバー編集')).toBeVisible({ timeout: 10000 })

    // メンバー基本情報がフォームにロードされたことを確認（＝データ取得成功）
    await expect(page.getByPlaceholder('例: ゆうき')).toHaveValue(memberName, { timeout: 5000 })

    // 口座情報セクションの入力（口座種別はデフォルトの「普通」のまま）
    await page.getByPlaceholder('例: 三菱UFJ銀行').fill(bankName)
    await page.getByPlaceholder('例: 渋谷支店').fill(branchName)
    await page.getByPlaceholder('例: 1234567').fill(accountNumber)
    await page.getByPlaceholder('例: ウチヤマ ユウキ').fill(accountHolder)

    // 全項目入力で「口座情報を保存」ボタンが有効化される
    const saveBtn = page.getByRole('button', { name: '口座情報を保存' })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // 保存成功後、口座が登録済みの状態となり「削除」ボタンが表示される
    await expect(page.getByRole('button', { name: '削除' })).toBeVisible({ timeout: 5000 })

    // API 経由でも保存されていることを確認（UI の見た目だけでなくデータ層まで検証）
    const res = await page.request.get(`${BASE_URL}/api/members/${memberId}/bank-account`)
    expect(res.ok()).toBeTruthy()
    const bankAccount = await res.json()
    expect(bankAccount).not.toBeNull()
    expect(bankAccount.bankName).toBe(bankName)
    expect(bankAccount.branchName).toBe(branchName)
    expect(bankAccount.accountType).toBe('SAVINGS')
    expect(bankAccount.accountNumber).toBe(accountNumber)
    expect(bankAccount.accountHolder).toBe(accountHolder)
  })

  test('3. メンバー一覧に「口座登録済」バッジが表示される', async ({ page }) => {
    expect(createdMemberIds.length).toBeGreaterThan(0)

    await page.goto('/members')

    // 作成メンバーのカード内に「口座登録済」バッジが含まれることを確認
    const memberCard = page
      .locator('div')
      .filter({ has: page.getByText(memberName, { exact: true }) })
      .filter({ has: page.getByText('口座登録済') })
      .first()

    await expect(memberCard).toBeVisible({ timeout: 10000 })
  })

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await cleanup(page)
    await context.close()
  })
})
