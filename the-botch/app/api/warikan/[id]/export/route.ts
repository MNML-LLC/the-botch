import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { WARIKAN_STATUS_LABELS } from '@/lib/constants'
import {
  contentDispositionAttachment,
  serializeCsv,
} from '@/lib/csv-utils'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

function formatDate(date: Date | null | undefined): string {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// GET /api/warikan/[id]/export — 割り勘イベントの精算結果を CSV でダウンロード
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true } },
        participants: {
          include: {
            member: { select: { id: true, name: true, fullName: true } },
          },
        },
        expenses: {
          include: {
            payer: { select: { id: true, name: true } },
            debtors: {
              include: {
                member: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        settlements: {
          include: {
            fromMember: { select: { id: true, name: true } },
            toMember: { select: { id: true, name: true } },
          },
          orderBy: { amount: 'desc' },
        },
      },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    const participantCount = warikanEvent.participants.length
    const totalAmount = warikanEvent.expenses.reduce((sum, e) => sum + e.amount, 0)
    const perPerson = participantCount > 0 ? Math.floor(totalAmount / participantCount) : 0

    // 「対象者=全員」の判定用
    const participantIdSet = new Set(warikanEvent.participants.map((p) => p.memberId))

    const rows: (readonly unknown[])[] = []

    // ============ イベント情報 ============
    rows.push(['# イベント情報'])
    rows.push(['イベント名', warikanEvent.eventName])
    rows.push(['ステータス', WARIKAN_STATUS_LABELS[warikanEvent.status]])
    rows.push(['管理者', warikanEvent.manager?.name ?? ''])
    rows.push(['明細追加期日', formatDate(warikanEvent.detailDeadline)])
    rows.push(['支払期日', formatDate(warikanEvent.paymentDeadline)])
    rows.push([
      '参加者',
      warikanEvent.participants.map((p) => p.member.name).join('、'),
    ])
    rows.push(['合計金額', totalAmount])
    rows.push(['1人あたり', perPerson])
    rows.push([])

    // ============ 立替明細 ============
    rows.push(['# 立替明細'])
    rows.push(['No', '立替者', '内容', '金額', '対象者'])
    if (warikanEvent.expenses.length === 0) {
      rows.push(['', '明細なし', '', '', ''])
    } else {
      warikanEvent.expenses.forEach((expense, i) => {
        const debtorMemberIds = expense.debtors.map((d) => d.memberId)
        const isAllParticipants =
          debtorMemberIds.length === 0 ||
          (participantCount > 0 &&
            debtorMemberIds.length === participantCount &&
            debtorMemberIds.every((mid) => participantIdSet.has(mid)))
        const debtorsLabel = isAllParticipants
          ? '全員'
          : expense.debtors.map((d) => d.member.name).join('、')
        rows.push([
          i + 1,
          expense.payer.name,
          expense.description,
          expense.amount,
          debtorsLabel,
        ])
      })
    }
    rows.push([])

    // ============ 精算フロー ============
    rows.push(['# 精算フロー（送金指示）'])
    rows.push(['No', 'From', 'To', '金額', '送金済み', '受領済み'])
    if (warikanEvent.settlements.length === 0) {
      rows.push(['', '精算不要', '', '', '', ''])
    } else {
      warikanEvent.settlements.forEach((s, i) => {
        rows.push([
          i + 1,
          s.fromMember.name,
          s.toMember.name,
          s.amount,
          s.isPaid ? '済' : '',
          s.isReceived ? '済' : '',
        ])
      })
    }

    const csv = serializeCsv(rows)
    const today = formatDate(new Date())
    const filename = `warikan_${warikanEvent.eventName}_${today}.csv`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': contentDispositionAttachment(filename),
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '割り勘 CSV エクスポートエラー',
      fallbackMessage: '割り勘 CSV のエクスポートに失敗しました',
    })
  }
}
