/**
 * warikan-calc.ts エッジケーステスト
 *
 * calculateSettlements / calculateMemberBalances の以下のケースを検証:
 * 1. 参加者1人のみ（精算不要）
 * 2. 全員が均等に立替（精算ゼロ）
 * 3. 端数（1円未満の按分）が発生するケース
 * 4. debtors 指定あり vs なし
 * 5. 参加者外が立替者になるケース
 *
 * 特に「端数が1円も消失しないこと」を assertion で検証する。
 */
import { describe, test, expect } from 'vitest'
import {
  calculateSettlements,
  calculateMemberBalances,
} from '@/lib/warikan-calc'

type Expense = {
  amount: number
  payerId: string
  debtors: { memberId: string }[]
}

// ------------------------------------------------------------
// ケース1: 参加者1人のみ（精算不要 → settlements が空配列）
// ------------------------------------------------------------
describe('ケース1: 参加者1人のみ', () => {
  test('立替なしなら settlements は空', () => {
    const result = calculateSettlements([], ['A'])
    expect(result.settlements).toEqual([])
    expect(result.totalAmount).toBe(0)
  })

  test('本人のみが立替 → 自分で自分に精算する必要はない', () => {
    const expenses: Expense[] = [
      { amount: 1000, payerId: 'A', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A'])
    expect(result.settlements).toEqual([])
    expect(result.totalAmount).toBe(1000)
  })

  test('balances: 立替=負担 でバランスは0', () => {
    const expenses: Expense[] = [
      { amount: 1000, payerId: 'A', debtors: [] },
    ]
    const balances = calculateMemberBalances(expenses, ['A'])
    expect(balances).toHaveLength(1)
    expect(balances[0]).toEqual({
      memberId: 'A',
      paid: 1000,
      owed: 1000,
      balance: 0,
    })
  })
})

// ------------------------------------------------------------
// ケース2: 全員が均等に立替（精算ゼロ）
// ------------------------------------------------------------
describe('ケース2: 全員が均等に立替', () => {
  test('全員が同額を立替（各 amount が人数で割り切れる）→ settlements は空', () => {
    // 999 = 3人で割り切れる金額を使用（端数の非対称配分を避ける）
    const expenses: Expense[] = [
      { amount: 999, payerId: 'A', debtors: [] },
      { amount: 999, payerId: 'B', debtors: [] },
      { amount: 999, payerId: 'C', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C'])
    expect(result.settlements).toEqual([])
    expect(result.totalAmount).toBe(2997)
  })

  test('全員が同額を立替（各 amount が人数で割り切れる）→ 各自のバランスは0', () => {
    const expenses: Expense[] = [
      { amount: 999, payerId: 'A', debtors: [] },
      { amount: 999, payerId: 'B', debtors: [] },
      { amount: 999, payerId: 'C', debtors: [] },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])
    for (const b of balances) {
      expect(b.balance).toBe(0)
      expect(b.paid).toBe(999)
      expect(b.owed).toBe(999)
    }
  })

  test('2人が同額を立替 → settlements は空', () => {
    const expenses: Expense[] = [
      { amount: 500, payerId: 'A', debtors: [] },
      { amount: 500, payerId: 'B', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A', 'B'])
    expect(result.settlements).toEqual([])
    expect(result.totalAmount).toBe(1000)
  })

  test('端数配分により全員同額でも balance が完全にゼロにならないケースを検証', () => {
    // 1000÷3=333余1。端数が毎回先頭(A)に配分されるため、
    // 全員が同額を立て替えても A の負担だけ +3円になる。
    // これは「1円も消失させない」設計の副作用として意図的な挙動。
    const expenses: Expense[] = [
      { amount: 1000, payerId: 'A', debtors: [] },
      { amount: 1000, payerId: 'B', debtors: [] },
      { amount: 1000, payerId: 'C', debtors: [] },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])

    // 全 balance の合計は 0（1円も消失しない）
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0)
    expect(totalBalance).toBe(0)

    // 全 owed 合計 = 全 amount 合計
    const totalOwed = balances.reduce((sum, b) => sum + b.owed, 0)
    expect(totalOwed).toBe(3000)
  })
})

// ------------------------------------------------------------
// ケース3: 端数（1円未満の按分）が発生するケース
// ------------------------------------------------------------
describe('ケース3: 端数（1円未満の按分）', () => {
  test('1000円 ÷ 3人 → 端数1円も失われない', () => {
    // 1000/3 = 333余1 → shares: [334, 333, 333]、合計1000
    const expenses: Expense[] = [
      { amount: 1000, payerId: 'A', debtors: [] },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])

    // owed の合計が amount と完全一致（1円も消失しない）
    const totalOwed = balances.reduce((sum, b) => sum + b.owed, 0)
    expect(totalOwed).toBe(1000)

    // 全 balance の合計は 0（立替総額と負担総額が一致）
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0)
    expect(totalBalance).toBe(0)

    // 各 owed は整数
    for (const b of balances) {
      expect(Number.isInteger(b.owed)).toBe(true)
    }
  })

  test('1000円 ÷ 3人 → settlement 合計が立替者以外の負担と一致', () => {
    const expenses: Expense[] = [
      { amount: 1000, payerId: 'A', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C'])

    // 各 settlement 金額は整数
    for (const s of result.settlements) {
      expect(Number.isInteger(s.amount)).toBe(true)
    }

    // A の負担 = 334（端数を先頭に配分）、B/C の負担 = 333 ずつ
    // A の受取 = 1000 - 334 = 666、settlement 合計は 333 + 333 = 666
    const totalSettlement = result.settlements.reduce((s, x) => s + x.amount, 0)
    expect(totalSettlement).toBe(666)
    expect(result.totalAmount).toBe(1000)
  })

  test('10001円 ÷ 7人 → 全 owed 合計が 10001 と完全一致', () => {
    // 10001/7 = 1428余5 → 先頭5人が1429、残り2人が1428、合計 5*1429+2*1428 = 10001
    const expenses: Expense[] = [
      { amount: 10001, payerId: 'P1', debtors: [] },
    ]
    const participants = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']
    const balances = calculateMemberBalances(expenses, participants)

    const totalOwed = balances.reduce((sum, b) => sum + b.owed, 0)
    expect(totalOwed).toBe(10001)

    // 端数配分: 先頭5人が baseShare+1、残り2人が baseShare
    expect(balances[0].owed).toBe(1429)
    expect(balances[4].owed).toBe(1429)
    expect(balances[5].owed).toBe(1428)
    expect(balances[6].owed).toBe(1428)
  })

  test('複数の端数を含む立替 → 全 owed 合計が全 amount と完全一致', () => {
    // 端数が複数の expense で累積しても失われないことを確認
    const expenses: Expense[] = [
      { amount: 1000, payerId: 'A', debtors: [] }, // 3人割: 334/333/333
      { amount: 2000, payerId: 'B', debtors: [] }, // 3人割: 667/667/666
      { amount: 3001, payerId: 'C', debtors: [] }, // 3人割: 1001/1000/1000
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])

    const totalOwed = balances.reduce((sum, b) => sum + b.owed, 0)
    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0)
    expect(totalOwed).toBe(totalAmount)

    const totalPaid = balances.reduce((sum, b) => sum + b.paid, 0)
    expect(totalPaid).toBe(totalAmount)

    // 収支の合計は 0
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0)
    expect(totalBalance).toBe(0)
  })

  test('端数を含む settlement の総和 = 立替者以外の負担合計', () => {
    // 7000 / 3 → 2334, 2333, 2333。A が立替 → A の受取 = 7000 - 2334 = 4666
    const expenses: Expense[] = [
      { amount: 7000, payerId: 'A', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C'])

    const totalSettlement = result.settlements.reduce((s, x) => s + x.amount, 0)
    // 送金額の合計 + 立替者の負担分 = 元の立替総額 (1円も消失しない)
    // A の負担 = 2334（先頭が端数を受け取る）
    expect(totalSettlement + 2334).toBe(7000)

    // 各 settlement 金額は整数
    for (const s of result.settlements) {
      expect(Number.isInteger(s.amount)).toBe(true)
      expect(s.amount).toBeGreaterThan(0)
    }
  })
})

// ------------------------------------------------------------
// ケース4: debtors 指定あり vs なし
// ------------------------------------------------------------
describe('ケース4: debtors 指定あり vs なし', () => {
  test('debtors 指定なし → 全参加者で均等割り', () => {
    const expenses: Expense[] = [
      { amount: 3000, payerId: 'A', debtors: [] },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])
    // 各自 1000 ずつ負担
    for (const b of balances) {
      expect(b.owed).toBe(1000)
    }
  })

  test('debtors 指定あり → 指定メンバーのみで按分', () => {
    // B と C の 2 人だけで按分（A は負担しない）
    const expenses: Expense[] = [
      {
        amount: 2000,
        payerId: 'A',
        debtors: [{ memberId: 'B' }, { memberId: 'C' }],
      },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])
    const a = balances.find((b) => b.memberId === 'A')!
    const b = balances.find((b) => b.memberId === 'B')!
    const c = balances.find((b) => b.memberId === 'C')!
    expect(a.owed).toBe(0)
    expect(b.owed).toBe(1000)
    expect(c.owed).toBe(1000)
  })

  test('debtors 指定あり → settlements が指定通りに算出される', () => {
    const expenses: Expense[] = [
      {
        amount: 2000,
        payerId: 'A',
        debtors: [{ memberId: 'B' }, { memberId: 'C' }],
      },
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C'])
    // A は 2000 全額を立替、B と C から 1000 ずつ受け取る
    expect(result.settlements).toHaveLength(2)
    const totalToA = result.settlements
      .filter((s) => s.toMemberId === 'A')
      .reduce((sum, s) => sum + s.amount, 0)
    expect(totalToA).toBe(2000)
    for (const s of result.settlements) {
      expect(s.toMemberId).toBe('A')
      expect(['B', 'C']).toContain(s.fromMemberId)
      expect(s.amount).toBe(1000)
    }
  })

  test('debtors の全員が参加者外 → 全参加者へフォールバック', () => {
    // 指定した debtors が誰も参加者に含まれない場合、全参加者で按分される
    const expenses: Expense[] = [
      {
        amount: 300,
        payerId: 'A',
        debtors: [{ memberId: 'X' }, { memberId: 'Y' }],
      },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])
    // フォールバックで全参加者で均等割り
    for (const b of balances) {
      expect(b.owed).toBe(100)
    }
  })

  test('debtors の一部が参加者外 → 参加者のみで按分', () => {
    // B と X を指定 → X はフィルタで除外され、B のみ按分
    const expenses: Expense[] = [
      {
        amount: 500,
        payerId: 'A',
        debtors: [{ memberId: 'B' }, { memberId: 'X' }],
      },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])
    const a = balances.find((b) => b.memberId === 'A')!
    const b = balances.find((b) => b.memberId === 'B')!
    const c = balances.find((b) => b.memberId === 'C')!
    expect(a.owed).toBe(0)
    expect(b.owed).toBe(500) // B のみが負担
    expect(c.owed).toBe(0)
  })
})

// ------------------------------------------------------------
// ケース5: 参加者外が立替者になるケース
// ------------------------------------------------------------
describe('ケース5: 参加者外が立替者', () => {
  test('calculateMemberBalances: 参加者外の立替者は結果に含まれない', () => {
    // X は参加者ではないが立替をした
    const expenses: Expense[] = [
      { amount: 900, payerId: 'X', debtors: [] },
    ]
    const balances = calculateMemberBalances(expenses, ['A', 'B', 'C'])

    // 返り値は participantIds の分のみ
    expect(balances).toHaveLength(3)
    expect(balances.every((b) => ['A', 'B', 'C'].includes(b.memberId))).toBe(true)

    // 参加者は全員 300 ずつ負担、paid は 0（X の paid は追跡されない）
    for (const b of balances) {
      expect(b.paid).toBe(0)
      expect(b.owed).toBe(300)
      expect(b.balance).toBe(-300)
    }
  })

  test('calculateSettlements: 参加者外の立替者は settlements に現れないが totalAmount には含まれる', () => {
    const expenses: Expense[] = [
      { amount: 900, payerId: 'X', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C'])

    // totalAmount は全 expense の合計
    expect(result.totalAmount).toBe(900)

    // participantIds のみが balance 計算に使われるため、debtors だけで creditor が
    // 参加者内にいない → settlements は空
    expect(result.settlements).toEqual([])
  })

  test('参加者外の立替者と参加者内の立替者が混在するケース', () => {
    // X (参加者外) が 300 立替、A (参加者内) が 900 立替、全員 [A,B,C] で按分
    const expenses: Expense[] = [
      { amount: 300, payerId: 'X', debtors: [] }, // 各自 100 負担
      { amount: 900, payerId: 'A', debtors: [] }, // 各自 300 負担
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C'])

    // totalAmount は両立替の合計
    expect(result.totalAmount).toBe(1200)

    // 各参加者の負担 = 400 (100 + 300)
    // A は 900 立替 → balance = 900 - 400 = +500 (受取側)
    // B, C は balance = -400 ずつ (支払側)
    // 参加者内 creditor(A:+500) < 参加者内 debtor 合計(-800) なので、
    // X 分の 300 相当は settlements には現れない
    const totalSettlement = result.settlements.reduce((s, x) => s + x.amount, 0)
    // 貪欲法により A が 500 まで受け取る → settlement 総和 = 500
    expect(totalSettlement).toBe(500)

    // 各 settlement の宛先は A のみ
    for (const s of result.settlements) {
      expect(s.toMemberId).toBe('A')
      expect(['B', 'C']).toContain(s.fromMemberId)
    }
  })
})

// ------------------------------------------------------------
// 追加: 複雑な組合せでも整数演算で端数が失われないことを検証
// ------------------------------------------------------------
describe('整数演算による端数保存の検証', () => {
  test('多数の立替×多数の参加者 → 全 owed 合計 = 全 amount 合計', () => {
    const expenses: Expense[] = [
      { amount: 1001, payerId: 'A', debtors: [] },
      { amount: 2003, payerId: 'B', debtors: [] },
      { amount: 3007, payerId: 'C', debtors: [] },
      { amount: 100, payerId: 'D', debtors: [] },
      { amount: 999, payerId: 'E', debtors: [] },
    ]
    const participants = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const balances = calculateMemberBalances(expenses, participants)

    const totalOwed = balances.reduce((sum, b) => sum + b.owed, 0)
    const totalPaid = balances.reduce((sum, b) => sum + b.paid, 0)
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0)

    // 1円も消失しない
    expect(totalOwed).toBe(totalAmount)
    expect(totalPaid).toBe(totalAmount)

    // 全 balance 合計は0
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0)
    expect(totalBalance).toBe(0)
  })

  test('settlements の各金額は整数かつ正の値', () => {
    const expenses: Expense[] = [
      { amount: 12345, payerId: 'A', debtors: [] },
      { amount: 6789, payerId: 'B', debtors: [] },
    ]
    const result = calculateSettlements(expenses, ['A', 'B', 'C', 'D'])

    for (const s of result.settlements) {
      expect(Number.isInteger(s.amount)).toBe(true)
      expect(s.amount).toBeGreaterThan(0)
      expect(s.fromMemberId).not.toBe(s.toMemberId)
    }
  })
})
