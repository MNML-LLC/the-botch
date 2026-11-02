/**
 * 男気ルール (MIN / CLUTCH) の単体テスト。
 * Issue #354: 男気 = ¥10,000 以上、クラッチ = ¥50,000 以上。
 *
 * 実行: npx vitest run tests/otokogi-schema.test.ts
 */
import { describe, test, expect } from 'vitest'
import { otokogiAmountSchema, createOtokogiSchema } from '@/lib/schemas/otokogi'
import { MIN_OTOKOGI_AMOUNT, CLUTCH_THRESHOLD } from '@/lib/constants'

describe('定数の妥当性 (regression guard)', () => {
  test('MIN_OTOKOGI_AMOUNT は ¥10,000', () => {
    expect(MIN_OTOKOGI_AMOUNT).toBe(10_000)
  })

  test('CLUTCH_THRESHOLD は ¥50,000', () => {
    expect(CLUTCH_THRESHOLD).toBe(50_000)
  })

  test('CLUTCH_THRESHOLD は MIN_OTOKOGI_AMOUNT より大きい', () => {
    // 設計上の不変条件 (MIN を超えた上でさらに特別高額をクラッチと呼ぶ)
    expect(CLUTCH_THRESHOLD).toBeGreaterThan(MIN_OTOKOGI_AMOUNT)
  })
})

describe('otokogiAmountSchema (¥10,000 以上チェック)', () => {
  test('MIN_OTOKOGI_AMOUNT ちょうどは通る', () => {
    const r = otokogiAmountSchema.safeParse(MIN_OTOKOGI_AMOUNT)
    expect(r.success).toBe(true)
  })

  test('MIN_OTOKOGI_AMOUNT - 1 は拒否される', () => {
    const r = otokogiAmountSchema.safeParse(MIN_OTOKOGI_AMOUNT - 1)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('男気')
      expect(r.error.issues[0].message).toContain('10,000')
    }
  })

  test('¥1 は positiveInt は通るが MIN で拒否される', () => {
    const r = otokogiAmountSchema.safeParse(1)
    expect(r.success).toBe(false)
  })

  test('0 以下 (positiveInt が先に落とす) → 拒否', () => {
    expect(otokogiAmountSchema.safeParse(0).success).toBe(false)
    expect(otokogiAmountSchema.safeParse(-1).success).toBe(false)
  })

  test('小数は int でない時点で拒否される', () => {
    expect(otokogiAmountSchema.safeParse(10_000.5).success).toBe(false)
  })

  test('クラッチ金額 (¥50,000) は通る', () => {
    expect(otokogiAmountSchema.safeParse(CLUTCH_THRESHOLD).success).toBe(true)
  })

  test('上限 ¥1,000,000,000 ちょうどは通る、超過は拒否', () => {
    expect(otokogiAmountSchema.safeParse(1_000_000_000).success).toBe(true)
    expect(otokogiAmountSchema.safeParse(1_000_000_001).success).toBe(false)
  })
})

describe('createOtokogiSchema (amount が MIN 未満だと通らない)', () => {
  const base = {
    eventDate: '2026-11-02',
    eventName: 'テスト',
    payerId: '00000000-0000-0000-0000-000000000010',
    participantIds: ['00000000-0000-0000-0000-000000000001'],
  }

  test('amount=10,000 は通る', () => {
    const r = createOtokogiSchema.safeParse({ ...base, amount: 10_000 })
    expect(r.success).toBe(true)
  })

  test('amount=9,999 は拒否される', () => {
    const r = createOtokogiSchema.safeParse({ ...base, amount: 9_999 })
    expect(r.success).toBe(false)
  })
})

describe('CLUTCH 判定ロジック (amount >= CLUTCH_THRESHOLD)', () => {
  // UI バッジや集計で使う境界条件を押さえる
  const cases: Array<{ amount: number; isClutch: boolean }> = [
    { amount: 0, isClutch: false },
    { amount: 10_000, isClutch: false },
    { amount: 49_999, isClutch: false },
    { amount: 50_000, isClutch: true },
    { amount: 50_001, isClutch: true },
    { amount: 100_000, isClutch: true },
  ]
  for (const { amount, isClutch } of cases) {
    test(`¥${amount.toLocaleString()} → ${isClutch ? 'CLUTCH' : '通常'}`, () => {
      expect(amount >= CLUTCH_THRESHOLD).toBe(isClutch)
    })
  }
})
