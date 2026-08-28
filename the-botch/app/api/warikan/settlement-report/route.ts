// POST /api/warikan/settlement-report?period=weekly|monthly
//
// GitHub Actions cron から呼ばれ、割り勘イベントの精算完了率・滞留状況を集計して
// Slack Incoming Webhook に投稿する。
//
// - `NOTIFY_API_TOKEN` が未設定 or Bearer トークン不一致 → 401
// - `SLACK_WEBHOOK_URL` 未設定 → Slack 送信はスキップし、集計結果のみ返す
// - `period` 未指定 or 不正値 → 400
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import {
  sendSlackMessage,
  isSlackWebhookEnabled,
  type SlackBlock,
} from '@/lib/slack/slackService'

type Period = 'weekly' | 'monthly'

interface ReportSummary {
  period: Period
  from: string
  to: string
  totalCount: number
  enteringCount: number
  payingCount: number
  closedCount: number
  completionRate: number
  unpaidSettlementCount: number
  unpaidSettlementAmount: number
}

interface ReportResponse {
  summary: ReportSummary
  slackSent: boolean
  slackEnabled: boolean
}

const PERIOD_LABEL: Record<Period, string> = {
  weekly: '週次',
  monthly: '月次',
}

const PERIOD_DAYS: Record<Period, number> = {
  weekly: 7,
  monthly: 30,
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

function parsePeriod(request: NextRequest): Period | null {
  const raw = request.nextUrl.searchParams.get('period')
  if (raw === 'weekly' || raw === 'monthly') return raw
  return null
}

/**
 * 指定 period に対応する集計開始日時（`from`）を JST 00:00 基準で算出する。
 * weekly = 7 日前、monthly = 30 日前の JST 00:00 を UTC Date で返す。
 */
function computeFromDate(now: Date, period: Period): Date {
  // JST の現在日を UTC で算出（JST = UTC+9）
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS)
  const jstYear = jstNow.getUTCFullYear()
  const jstMonth = jstNow.getUTCMonth()
  const jstDay = jstNow.getUTCDate()
  // JST 00:00 (今日) を UTC で表現すると `today JST 00:00 = 前日 UTC 15:00`
  const jstTodayStartUtc = Date.UTC(jstYear, jstMonth, jstDay) - JST_OFFSET_MS
  const days = PERIOD_DAYS[period]
  return new Date(jstTodayStartUtc - days * 24 * 60 * 60 * 1000)
}

function formatJstDate(date: Date): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000
  const jst = new Date(date.getTime() + JST_OFFSET_MS)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString('en-US')}`
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function buildSlackBlocks(summary: ReportSummary): {
  text: string
  blocks: SlackBlock[]
} {
  const label = PERIOD_LABEL[summary.period]
  const today = formatJstDate(new Date())
  const rateStr = `${summary.completionRate.toFixed(1)}%`
  const unpaidStr = `${summary.unpaidSettlementCount}件 / 合計 ${formatAmount(summary.unpaidSettlementAmount)}`

  const fallbackText =
    `📊 [${label}] 割り勘 精算レポート（${today}）\n` +
    `完了率: ${rateStr} (${summary.closedCount}件完了 / ${summary.totalCount}件中)\n` +
    `明細入力中: ${summary.enteringCount}件\n` +
    `支払い待ち: ${summary.payingCount}件（未払い精算: ${unpaidStr}）\n` +
    `クローズ済み: ${summary.closedCount}件`

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 [${label}] 割り勘 精算レポート（${today}）`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*完了率*\n${rateStr} (${summary.closedCount}件完了 / ${summary.totalCount}件中)`,
        },
        {
          type: 'mrkdwn',
          text: `*集計期間*\n${summary.from} 〜 ${summary.to}`,
        },
        {
          type: 'mrkdwn',
          text: `*明細入力中*\n${summary.enteringCount}件`,
        },
        {
          type: 'mrkdwn',
          text: `*支払い待ち*\n${summary.payingCount}件`,
        },
        {
          type: 'mrkdwn',
          text: `*クローズ済み*\n${summary.closedCount}件`,
        },
        {
          type: 'mrkdwn',
          text: `*未払い精算*\n${unpaidStr}`,
        },
      ],
    },
  ]

  return { text: fallbackText, blocks }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 })
  }

  const period = parsePeriod(request)
  if (!period) {
    return NextResponse.json(
      { error: 'period は weekly または monthly を指定してください' },
      { status: 400 },
    )
  }

  try {
    const now = new Date()
    const fromDate = computeFromDate(now, period)

    // 対象期間に作成された WarikanEvent をステータス別に集計
    const grouped = await prisma.warikanEvent.groupBy({
      by: ['status'],
      where: { createdAt: { gte: fromDate } },
      _count: { _all: true },
    })

    let enteringCount = 0
    let payingCount = 0
    let closedCount = 0
    for (const row of grouped) {
      const count = row._count._all
      if (row.status === 'ENTERING') enteringCount = count
      else if (row.status === 'PAYING') payingCount = count
      else if (row.status === 'CLOSED') closedCount = count
    }
    const totalCount = enteringCount + payingCount + closedCount
    const completionRate =
      totalCount === 0 ? 0 : roundOneDecimal((closedCount / totalCount) * 100)

    // PAYING 中イベントの未払い WarikanSettlement を集計（期間フィルタ無し・全 PAYING が対象）
    const unpaidAggregate = await prisma.warikanSettlement.aggregate({
      where: {
        isPaid: false,
        warikanEvent: { status: 'PAYING' },
      },
      _count: { _all: true },
      _sum: { amount: true },
    })

    const summary: ReportSummary = {
      period,
      from: formatJstDate(fromDate),
      to: formatJstDate(now),
      totalCount,
      enteringCount,
      payingCount,
      closedCount,
      completionRate,
      unpaidSettlementCount: unpaidAggregate._count._all,
      unpaidSettlementAmount: unpaidAggregate._sum.amount ?? 0,
    }

    const response: ReportResponse = {
      summary,
      slackSent: false,
      slackEnabled: isSlackWebhookEnabled(),
    }

    if (response.slackEnabled) {
      const { text, blocks } = buildSlackBlocks(summary)
      try {
        const sendResult = await sendSlackMessage({ text, blocks })
        response.slackSent = sendResult.sent
      } catch (error) {
        console.error(
          '[api/warikan/settlement-report] Slack 送信失敗:',
          error,
        )
        // Slack 送信失敗はレスポンス自体は 200 で返し、slackSent: false のまま
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    return handleApiError(error, {
      logLabel: '割り勘精算レポート集計エラー',
      fallbackMessage: '割り勘精算レポートの集計に失敗しました',
    })
  }
}
