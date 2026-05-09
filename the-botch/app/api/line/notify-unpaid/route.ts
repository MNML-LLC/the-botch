import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendIndividualMessage } from '@/lib/line/lineService'

function formatDate(date: Date): string {
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('ja-JP')
}

// POST /api/line/notify-unpaid — GitHub Actions cron から呼ばれて未払い精算を通知
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token || token !== process.env.NOTIFY_API_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const unpaidSettlements = await prisma.warikanSettlement.findMany({
      where: { isPaid: false },
      include: {
        fromMember: {
          include: { lineAccount: true },
        },
        toMember: true,
        warikanEvent: true,
      },
    })

    if (unpaidSettlements.length === 0) {
      return NextResponse.json({ sent: 0, message: '未払い精算はありません' })
    }

    // fromMemberId ごとにグルーピング
    const grouped = new Map<string, typeof unpaidSettlements>()
    for (const s of unpaidSettlements) {
      const existing = grouped.get(s.fromMemberId) ?? []
      existing.push(s)
      grouped.set(s.fromMemberId, existing)
    }

    let sent = 0
    const errors: string[] = []

    for (const [, settlements] of grouped) {
      const { fromMember } = settlements[0]

      if (!fromMember.lineAccount?.lineUserId || !fromMember.lineAccount.isActive) {
        continue
      }

      const total = settlements.reduce((sum, s) => sum + s.amount, 0)
      const lines = settlements
        .map((s) => {
          const eventDate = s.warikanEvent.displayDate ?? s.warikanEvent.createdAt
          return `- ${s.warikanEvent.eventName}（${formatDate(eventDate)}）: ${formatAmount(s.amount)}円 → ${s.toMember.name}`
        })
        .join('\n')

      const message =
        `${fromMember.name} さん、未払いの精算があります:\n` +
        `${lines}\n` +
        `合計 ${formatAmount(total)}円\n\n` +
        `精算済みなら、アプリで「支払い済み」をマークしてください。`

      try {
        await sendIndividualMessage(fromMember.lineAccount.lineUserId, message)
        sent++
      } catch (err) {
        console.error(`LINE 送信エラー (${fromMember.name}):`, err)
        errors.push(fromMember.name)
      }
    }

    return NextResponse.json({ sent, errors: errors.length > 0 ? errors : undefined })
  } catch (error) {
    console.error('未払い通知エラー:', error)
    return NextResponse.json({ error: '通知処理に失敗しました' }, { status: 500 })
  }
}
