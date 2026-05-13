import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMsGraphEnabled, listOutlookEvents } from '@/lib/msgraph'

// Outlook → the-botch の内向き同期 (polling)
// Vercel Cron (GET) または手動呼び出し (POST) で使用。CRON_SECRET で保護。
async function runInboundSync(request: NextRequest): Promise<NextResponse> {
  if (!isMsGraphEnabled()) {
    return NextResponse.json({ error: 'MS Graph が設定されていません' }, { status: 503 })
  }

  // Vercel Cron / 手動呼び出し認証 (CRON_SECRET 設定時のみ検証)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // 今日から 3 ヶ月後までの Outlook イベントを取得
    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + 3)

    const outlookEvents = await listOutlookEvents(startDate, endDate)

    // 既に同期済みの outlookEventId を取得してスキップリストを作成
    const existingRecords = await prisma.event.findMany({
      where: { outlookEventId: { not: null } },
      select: { outlookEventId: true },
    })
    const existingOutlookIds = new Set(
      existingRecords
        .map((r) => r.outlookEventId)
        .filter((id): id is string => id !== null)
    )

    // インポート先のデフォルト作成者 (アクティブメンバーの先頭)
    const systemMember = await prisma.member.findFirst({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })

    if (!systemMember) {
      return NextResponse.json({ error: 'アクティブメンバーが存在しません' }, { status: 500 })
    }

    let created = 0
    const errors: string[] = []

    for (const oe of outlookEvents) {
      if (existingOutlookIds.has(oe.id)) continue

      try {
        // Outlook の日時文字列を Date に変換 (UTC として扱う)
        const normalizeDate = (dt: string) =>
          new Date(dt.endsWith('Z') ? dt : dt + 'Z')

        const eventStart = normalizeDate(oe.start.dateTime)
        // all-day イベントは end が exclusive (最終日 + 1 日) → 1 日引く
        const eventEndRaw = normalizeDate(oe.end.dateTime)
        const eventEnd = new Date(eventEndRaw.getTime() - 24 * 60 * 60 * 1000)

        const isSingleDay =
          eventStart.toISOString().split('T')[0] === eventEnd.toISOString().split('T')[0]

        // HTML タグを除去してプレーンテキスト取得
        const plainBody = oe.body.content?.replace(/<[^>]*>/g, '').trim() || null

        await prisma.event.create({
          data: {
            title: oe.subject || '(タイトルなし)',
            date: eventStart,
            endDate: isSingleDay ? null : eventEnd,
            description: plainBody,
            eventType: 'OTHER',
            createdById: systemMember.id,
            outlookEventId: oe.id,
          },
        })

        created++
      } catch (err) {
        const msg = `Outlook イベント ${oe.id} のインポート失敗: ${String(err)}`
        console.error('[msgraph] inbound-sync:', msg)
        errors.push(msg)
      }
    }

    console.log(
      `[msgraph] inbound-sync 完了: checked=${outlookEvents.length} created=${created} errors=${errors.length}`
    )

    return NextResponse.json({
      success: true,
      checked: outlookEvents.length,
      created,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[msgraph] inbound-sync 致命的エラー:', error)
    return NextResponse.json({ error: '同期に失敗しました' }, { status: 500 })
  }
}

// GET — Vercel Cron からの呼び出し
export async function GET(request: NextRequest) {
  return runInboundSync(request)
}

// POST — 手動トリガー用
export async function POST(request: NextRequest) {
  return runInboundSync(request)
}
