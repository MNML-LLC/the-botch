/**
 * 割り勘精算の計算ロジック（共通関数）
 *
 * 按分・送金フロー生成を整数演算で行い、端数の消失を防ぐ。
 * DB操作は呼び出し側で行う。
 */

interface Expense {
  amount: number
  payerId: string
  debtors: { memberId: string }[]
}

export interface SettlementEntry {
  fromMemberId: string
  toMemberId: string
  amount: number
}

/**
 * 立替明細と参加者IDから精算フロー（誰が誰にいくら送金するか）を計算する。
 * 全て整数演算。浮動小数点を使わない。
 */
export function calculateSettlements(
  expenses: Expense[],
  participantIds: string[]
): { settlements: SettlementEntry[]; totalAmount: number } {
  // 各メンバーの立替額と負担額を集計
  const paidByMember: Record<string, number> = {}
  const owedByMember: Record<string, number> = {}
  for (const memberId of participantIds) {
    paidByMember[memberId] = 0
    owedByMember[memberId] = 0
  }

  let totalAmount = 0

  for (const expense of expenses) {
    totalAmount += expense.amount

    // 立替者の支払額を加算（参加者でない立替者もバランスに含める）
    if (paidByMember[expense.payerId] === undefined) {
      paidByMember[expense.payerId] = 0
      owedByMember[expense.payerId] = 0
    }
    paidByMember[expense.payerId] += expense.amount

    // 対象者で按分（debtorsが空なら全参加者で均等割り）
    const filteredDebtors = expense.debtors.length > 0
      ? expense.debtors.map((d) => d.memberId).filter((id) => participantIds.includes(id))
      : []
    // debtors指定なし or 全員フィルタで消えた場合は全参加者にフォールバック
    const debtorMemberIds = filteredDebtors.length > 0 ? filteredDebtors : participantIds

    // 整数演算: 端数は先頭のメンバーに割り当て（1円も失わない）
    const baseShare = Math.floor(expense.amount / debtorMemberIds.length)
    const remainder = expense.amount % debtorMemberIds.length
    for (let i = 0; i < debtorMemberIds.length; i++) {
      const share = baseShare + (i < remainder ? 1 : 0)
      owedByMember[debtorMemberIds[i]] = (owedByMember[debtorMemberIds[i]] ?? 0) + share
    }
  }

  // 各メンバーの収支（立替額 - 負担額）
  // プラス = 立替超過（受け取る側）、マイナス = 不足（支払う側）
  const balances: { memberId: string; balance: number }[] = participantIds.map(
    (memberId) => ({
      memberId,
      balance: paidByMember[memberId] - owedByMember[memberId],
    })
  )

  // 貪欲法で最適な送金フローを計算
  const creditors = balances
    .filter((b) => b.balance > 0)
    .sort((a, b) => b.balance - a.balance)
  const debtors = balances
    .filter((b) => b.balance < 0)
    .sort((a, b) => a.balance - b.balance)

  const settlements: SettlementEntry[] = []

  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci].balance
    const debt = -debtors[di].balance

    // balance は全て整数なので丸め不要
    const transferAmount = Math.min(credit, debt)

    if (transferAmount > 0) {
      settlements.push({
        fromMemberId: debtors[di].memberId,
        toMemberId: creditors[ci].memberId,
        amount: transferAmount,
      })
    }

    creditors[ci].balance -= transferAmount
    debtors[di].balance += transferAmount

    // 整数判定: 残高がゼロなら次へ
    if (creditors[ci].balance <= 0) ci++
    if (di < debtors.length && debtors[di].balance >= 0) di++
  }

  return { settlements, totalAmount }
}
