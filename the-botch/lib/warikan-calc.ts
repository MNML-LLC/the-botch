/**
 * 割り勘精算の計算ロジック（共通関数）
 *
 * 按分・送金フロー生成を整数演算で行い、端数の消失を防ぐ。
 * DB操作は呼び出し側で行う。
 *
 * ============================================================================
 * アルゴリズム解説
 * ============================================================================
 *
 * 本ファイルは大きく2つの処理からなる:
 *   1. 按分計算: 各立替明細を対象メンバーに割り振り、各人の「立替額」と
 *      「負担額」を積み上げる（`calculateMemberBalances` / `calculateSettlements`
 *      の前半）。
 *   2. 送金フロー最適化: 各人の収支（立替額 − 負担額）から、誰が誰にいくら
 *      送金すれば全員の収支がゼロになるかを「貪欲法」で算出する
 *      （`calculateSettlements` の後半）。
 *
 * ----------------------------------------------------------------------------
 * 按分と端数処理（先頭メンバーへの割り当て）
 * ----------------------------------------------------------------------------
 *
 * 金額は円（整数）でしか扱わないため、割り切れない立替は必ず端数が出る。
 * 浮動小数点で按分すると 0.333... 円のような値が生じ、四捨五入すると
 * 合計が元の金額と一致しなくなり「1円だけ合わない」バグの温床になる。
 *
 * そこで本実装は完全に整数演算で行う:
 *
 *   baseShare = Math.floor(amount / N)   // 全員が負担する基礎額
 *   remainder = amount % N               // 割り切れなかった端数（0〜N-1円）
 *   → 先頭から remainder 人だけ baseShare + 1 円を負担する
 *
 * 「先頭メンバー」に端数を寄せているのは、決定的（deterministic）で
 * 再計算しても結果が変わらず、テストしやすいため。負担順序は入力の
 * `debtors` 配列（または `participantIds`）の並び順にそのまま依存する。
 * 特定メンバーへの偏りが問題になる場合は、呼び出し側で並び順を制御する。
 *
 * 例: 1,000 円を 3 人 [A, B, C] で割り勘
 *   baseShare = 333, remainder = 1
 *   A: 334 円 / B: 333 円 / C: 333 円 （合計 1,000 円 ← 1円も失わない）
 *
 * ----------------------------------------------------------------------------
 * 送金フロー最適化（貪欲法を採用する理由）
 * ----------------------------------------------------------------------------
 *
 * N人の収支が確定した後、誰が誰にいくら送金するかには自由度がある。
 * 目的は「送金回数（＝送金トランザクション数）をできるだけ少なくする」
 * こと。送金回数が少ないほど、送金手数料・振込作業・照合の手間が減る。
 *
 * 一般に、この最小化問題（Minimum Cash Flow / Debt Simplification）は
 * 部分和問題を含む NP-hard だが、実運用の割り勘（数人〜十数人）では
 * 以下の貪欲法で十分実用的な回数に収まる:
 *
 *   1. 収支プラス（受取側 = creditors）を金額の大きい順にソート
 *   2. 収支マイナス（支払側 = debtors）を金額の小さい順（＝絶対値の大きい順）
 *      にソート
 *   3. 先頭同士をマッチさせ、min(受取残, 支払残) を1件の送金にする
 *   4. 消化された側のポインタを進め、残高が残っている側は据え置く
 *   5. どちらかが尽きるまで繰り返す
 *
 * このアプローチは各ステップで「必ず1人以上の残高が確実にゼロになる」
 * ため、最悪でも N-1 回の送金で完了する（総和がゼロという性質による）。
 * 全ペアを網羅する素朴な方法（最大 N*(N-1)/2 回）より大幅に少ない。
 *
 * 例: 3人 A, B, C で以下の収支だったとする
 *   A: +600 円（600円受け取る）
 *   B: -400 円（400円支払う）
 *   C: -200 円（200円支払う）
 *
 *   creditors = [A(600)]
 *   debtors   = [B(-400), C(-200)]
 *
 *   step1: A と B をマッチ → min(600, 400) = 400 円送金
 *          [B → A: 400 円]  A残高 200 / B残高 0（B消化）
 *   step2: A と C をマッチ → min(200, 200) = 200 円送金
 *          [C → A: 200 円]  A残高 0 / C残高 0（両者消化）
 *
 *   結果: 送金は 2 回で完了（3人なので最大 2 = N-1 回）
 *
 * ----------------------------------------------------------------------------
 * 不変条件
 * ----------------------------------------------------------------------------
 * - 全メンバーの `paid - owed` の総和は常に 0（端数処理を整数で完結させた結果）
 * - よって creditors 残高合計 = debtors 残高絶対値合計 となり、貪欲法は
 *   両サイドを同時に消化しきる
 * - 送金額は常に正の整数
 *
 * ============================================================================
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

export interface MemberBalance {
  memberId: string
  paid: number
  owed: number
  balance: number
}

/**
 * 各参加者の立替済み額・払うべき額・収支を計算する。
 * リアルタイムプレビュー用。DB操作なし。
 */
export function calculateMemberBalances(
  expenses: Expense[],
  participantIds: string[]
): MemberBalance[] {
  const paidByMember: Record<string, number> = {}
  const owedByMember: Record<string, number> = {}
  for (const memberId of participantIds) {
    paidByMember[memberId] = 0
    owedByMember[memberId] = 0
  }

  for (const expense of expenses) {
    if (paidByMember[expense.payerId] !== undefined) {
      paidByMember[expense.payerId] += expense.amount
    }

    const filteredDebtors =
      expense.debtors.length > 0
        ? expense.debtors.map((d) => d.memberId).filter((id) => participantIds.includes(id))
        : []
    const debtorMemberIds = filteredDebtors.length > 0 ? filteredDebtors : participantIds

    const baseShare = Math.floor(expense.amount / debtorMemberIds.length)
    const remainder = expense.amount % debtorMemberIds.length
    for (let i = 0; i < debtorMemberIds.length; i++) {
      const share = baseShare + (i < remainder ? 1 : 0)
      owedByMember[debtorMemberIds[i]] = (owedByMember[debtorMemberIds[i]] ?? 0) + share
    }
  }

  return participantIds.map((memberId) => ({
    memberId,
    paid: paidByMember[memberId],
    owed: owedByMember[memberId],
    balance: paidByMember[memberId] - owedByMember[memberId],
  }))
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
