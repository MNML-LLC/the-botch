// POST /api/line/notify-unpaid
//
// GitHub Actions cron から呼ばれ、未払い（`isPaid = false`）の割り勘精算を
// 送金元メンバーごとにまとめて LINE 通知する。
//
// - `NOTIFY_API_TOKEN` が未設定 or Bearer トークン不一致 → 401
// - `LINE_CHANNEL_ACCESS_TOKEN` 未設定 → LINE 送信はスキップし、集計結果のみ返す
// - `MemberLineAccount` 未登録のメンバーはスキップ（エラーにしない）
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import {
  sendIndividualMessage,
  isLineMessagingEnabled,
} from '@/lib/line/lineService'

interface UnpaidGroup {
  fromMemberId: string
  fromMemberName: string
  lineUserId: string
  totalAmount: number
  items: Array<{
    eventName: string
    displayDate: Date | null
    amount: number
    toMemberName: string
  }>
}

interface NotifyResult {
  targetMemberCount: number
  linkedMemberCount: number
  sentCount: number
  skippedCount: number
  lineMessagingEnabled: boolean
  errors: Array<{ memberId: string; message: string }>
}

/** Bearer 認証: `NOTIFY_API_TOKEN` 未設定なら常に 401 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.NOTIFY_API_TOKEN
  if (!expected) return false

  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return false
  return match[1].trim() === expected
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildMessage(group: UnpaidGroup): string {
  const lines: string[] = []
  lines.push(`${group.fromMemberName} さん、未払いの精算があります:`)
  for (const item of group.items) {
    const datePart = item.displayDate ? `（${formatDate(item.displayDate)}）` : ''
    lines.push(
      `- ${item.eventName}${datePart}: ${item.amount.toLocaleString('en-US')}円 → ${item.toMemberName}`,
    )
  }
  lines.push(`合計 ${group.totalAmount.toLocaleString('en-US')}円`)
  lines.push('')
  lines.push('精算済みなら、アプリで「支払い済み」をマークしてください。')
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 })
  }

  try {
    // 未払い精算をまとめて取得（PAYING 中の割り勘に紐づくもの）
    const unpaid = await prisma.warikanSettlement.findMany({
      where: {
        isPaid: false,
        warikanEvent: { status: 'PAYING' },
      },
      include: {
        warikanEvent: {
          select: { eventName: true, displayDate: true },
        },
        fromMember: {
          select: {
            id: true,
            name: true,
            lineAccount: {
              select: { lineUserId: true, isActive: true },
            },
          },
        },
        toMember: { select: { name: true } },
      },
    })

    // 送金元メンバー単位でグルーピング
    const groupsByMember = new Map<string, UnpaidGroup>()
    const unlinkedMemberIds = new Set<string>()

    for (const s of unpaid) {
      const memberId = s.fromMember.id
      const account = s.fromMember.lineAccount
      if (!account || !account.isActive) {
        unlinkedMemberIds.add(memberId)
        continue
      }

      const existing = groupsByMember.get(memberId)
      const item = {
        eventName: s.warikanEvent.eventName,
        displayDate: s.warikanEvent.displayDate,
        amount: s.amount,
        toMemberName: s.toMember.name,
      }
      if (existing) {
        existing.items.push(item)
        existing.totalAmount += s.amount
      } else {
        groupsByMember.set(memberId, {
          fromMemberId: memberId,
          fromMemberName: s.fromMember.name,
          lineUserId: account.lineUserId,
          totalAmount: s.amount,
          items: [item],
        })
      }
    }

    // 未払いメンバーの総数（LINE 連携有無問わず）
    const targetMemberCount = groupsByMember.size + unlinkedMemberIds.size

    const result: NotifyResult = {
      targetMemberCount,
      linkedMemberCount: groupsByMember.size,
      sentCount: 0,
      skippedCount: unlinkedMemberIds.size,
      lineMessagingEnabled: isLineMessagingEnabled(),
      errors: [],
    }

    // 全員支払い済みなら早期 return
    if (groupsByMember.size === 0) {
      return NextResponse.json(result)
    }

    for (const group of groupsByMember.values()) {
      const message = buildMessage(group)
      try {
        const sendResult = await sendIndividualMessage(group.lineUserId, message)
        if (sendResult.sent) {
          result.sentCount += 1
        } else {
          // LINE_CHANNEL_ACCESS_TOKEN 未設定 → スキップ扱い（エラーにはしない）
          result.skippedCount += 1
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `[api/line/notify-unpaid] LINE 送信失敗 memberId=${group.fromMemberId}:`,
          error,
        )
        result.errors.push({ memberId: group.fromMemberId, message })
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error, {
      logLabel: 'LINE 未払い通知エラー',
      fallbackMessage: 'LINE 未払い通知に失敗しました',
    })
  }
}
