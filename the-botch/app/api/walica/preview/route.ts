import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const WALICA_API = 'https://manage-expence-api-prod.herokuapp.com/api'

// Walica APIのレスポンス型（スネークケース）
type WalicaMember = {
  member_id: number
  member_name: string
}

type WalicaDebtor = {
  debtor_id: number
  debtor_name: string
}

type WalicaPayment = {
  payment_id: number
  item_name: string
  price: number
  currency_code: string
  currency_symbol: string
  advance_payer_id: number
  advance_payer_name: string
  debtors: WalicaDebtor[]
  create_datetime: string
}

type WalicaPaybackTransaction = {
  sender_name: string
  receiver_name: string
  priceV2: number
}

// GET /api/walica/preview?url=https://walica.jp/g/xxx
// Walica URLからデータをプレビュー取得し、メンバーの自動マッチング結果を返す
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walicaUrl = searchParams.get('url')

    if (!walicaUrl) {
      return NextResponse.json(
        { error: 'url パラメータが必要です' },
        { status: 400 }
      )
    }

    // URLからgroup_idを抽出
    const groupId = extractGroupId(walicaUrl)
    if (!groupId) {
      return NextResponse.json(
        { error: 'Walica URLの形式が正しくありません（例: https://walica.jp/g/xxxxx）' },
        { status: 400 }
      )
    }

    // Walica APIから並行取得
    const [groupRes, paymentsRes, paybackRes] = await Promise.all([
      fetch(`${WALICA_API}/group/${groupId}`),
      fetch(`${WALICA_API}/group/${groupId}/pay`),
      fetch(`${WALICA_API}/group/${groupId}/payback_transaction?shift_decimal_point=false`),
    ])

    if (!groupRes.ok) {
      const status = groupRes.status
      if (status === 404) {
        return NextResponse.json(
          { error: 'Walicaのグループが見つかりません。URLを確認してください' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: `Walica APIエラー (${status})` },
        { status: 502 }
      )
    }

    const groupData = await groupRes.json() as {
      group_id: string
      group_name: string
      members: WalicaMember[]
      base_currency_code: string
      base_currency_symbol: string
    }
    const paymentsData = await paymentsRes.json() as { items: WalicaPayment[] }
    const paybackData = await paybackRes.json() as { payback_transaction: WalicaPaybackTransaction[] }

    // アプリのメンバー一覧を取得
    const appMembers = await prisma.member.findMany({
      where: { isActive: true },
      select: { id: true, name: true, fullName: true },
    })

    // Walicaメンバーとアプリメンバーの自動マッチング
    const memberMatching = groupData.members.map((wm) => {
      const matched = findBestMatch(wm.member_name, appMembers)
      return {
        walicaId: String(wm.member_id),
        walicaName: wm.member_name,
        matchedMemberId: matched?.id ?? null,
        matchedMemberName: matched?.name ?? null,
        confidence: matched ? getMatchConfidence(wm.member_name, matched.name, matched.fullName) : 0,
      }
    })

    // 合計金額の計算
    const totalAmount = paymentsData.items.reduce((sum, p) => sum + Math.round(p.price), 0)

    return NextResponse.json({
      groupName: groupData.group_name,
      currency: groupData.base_currency_code,
      members: memberMatching,
      expenses: paymentsData.items.map((p) => ({
        itemName: p.item_name,
        amount: Math.round(p.price),
        payerName: p.advance_payer_name,
        debtorNames: p.debtors.map((d) => d.debtor_name),
        date: p.create_datetime ?? null,
      })),
      settlements: paybackData.payback_transaction
        .filter((t) => t.priceV2 !== 0)
        .map((t) => ({
          senderName: t.sender_name,
          receiverName: t.receiver_name,
          amount: Math.round(t.priceV2),
        })),
      totalAmount,
      expenseCount: paymentsData.items.length,
    })
  } catch (error) {
    console.error('Walicaプレビューエラー:', error)
    return NextResponse.json(
      { error: 'Walicaデータの取得に失敗しました' },
      { status: 500 }
    )
  }
}

// Walica URLからgroup_idを抽出
function extractGroupId(url: string): string | null {
  // https://walica.jp/g/xxxxx or https://walica.jp/group/xxxxx
  const match = url.match(/walica\.jp\/(?:g|group)\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

// 名前の類似度マッチング
function findBestMatch(
  walicaName: string,
  appMembers: { id: string; name: string; fullName: string }[]
): { id: string; name: string; fullName: string } | null {
  const normalized = walicaName.toLowerCase().trim()

  // 完全一致（名前 or フルネーム）
  for (const m of appMembers) {
    if (m.name === walicaName || m.fullName === walicaName) return m
    if (m.name.toLowerCase() === normalized || m.fullName.toLowerCase() === normalized) return m
  }

  // 部分一致（含む）
  for (const m of appMembers) {
    const mName = m.name.toLowerCase()
    const mFull = m.fullName.toLowerCase()
    if (normalized.includes(mName) || mName.includes(normalized)) return m
    if (normalized.includes(mFull) || mFull.includes(normalized)) return m
  }

  // ひらがな・カタカナ変換して比較
  const normalizedHira = toHiragana(normalized)
  for (const m of appMembers) {
    const mHira = toHiragana(m.name.toLowerCase())
    if (normalizedHira === mHira || normalizedHira.includes(mHira) || mHira.includes(normalizedHira)) return m
  }

  return null
}

// マッチの信頼度を計算（0-100）
function getMatchConfidence(walicaName: string, appName: string, appFullName: string): number {
  const wn = walicaName.toLowerCase().trim()
  const an = appName.toLowerCase()
  const af = appFullName.toLowerCase()

  if (wn === an || wn === af) return 100
  if (wn.includes(an) || an.includes(wn)) return 80
  if (wn.includes(af) || af.includes(wn)) return 80
  return 50
}

// カタカナ→ひらがな変換
function toHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  )
}
