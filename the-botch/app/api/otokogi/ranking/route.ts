import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { parsePeriodFromSearchParams } from '@/lib/date-utils'
import { CLUTCH_THRESHOLD } from '@/lib/constants'

// Raw SQL 結果型
type RankingRow = {
  member_id: string
  name: string
  initial: string
  color_bg: string
  color_text: string
  count: bigint
  total_paid: bigint
  clutch_count: bigint
  participation_count: bigint
}

function buildPayerDateSql(from: Date | null, to: Date | null): Prisma.Sql {
  if (from && to) return Prisma.sql`WHERE event_date >= ${from} AND event_date <= ${to}`
  if (from) return Prisma.sql`WHERE event_date >= ${from}`
  if (to) return Prisma.sql`WHERE event_date <= ${to}`
  return Prisma.empty
}

function buildParticipantDateSql(from: Date | null, to: Date | null): Prisma.Sql {
  if (from && to) return Prisma.sql`WHERE oe.event_date >= ${from} AND oe.event_date <= ${to}`
  if (from) return Prisma.sql`WHERE oe.event_date >= ${from}`
  if (to) return Prisma.sql`WHERE oe.event_date <= ${to}`
  return Prisma.empty
}

// GET /api/otokogi/ranking — 男気ランキング（Raw SQL JOIN 1クエリ化）
// クエリ: period / from / to / year (backward compat)
// Phase 2 (Issue #364): クラッチ回数・参加回数を追加して Top-3 ヒーローカードで使えるようにした
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { from, to } = parsePeriodFromSearchParams(searchParams)

    const payerWhere = buildPayerDateSql(from, to)
    const participantWhere = buildParticipantDateSql(from, to)

    // payer 集計 (支払回数・総額・クラッチ回数) と participation 集計 (参加回数) を
    // サブクエリで 1 クエリ結合。支払実績がないメンバーは出さない (INNER JOIN on payer)。
    const rows = await prisma.$queryRaw<RankingRow[]>`
      SELECT
        m.id AS member_id,
        m.name,
        m.initial,
        m.color_bg,
        m.color_text,
        payer.count,
        payer.total_paid,
        payer.clutch_count,
        COALESCE(part.participation_count, 0)::bigint AS participation_count
      FROM (
        SELECT
          payer_id,
          COUNT(*)::bigint AS count,
          SUM(amount)::bigint AS total_paid,
          COUNT(*) FILTER (WHERE amount >= ${CLUTCH_THRESHOLD})::bigint AS clutch_count
        FROM otokogi_events
        ${payerWhere}
        GROUP BY payer_id
      ) payer
      JOIN members m ON m.id = payer.payer_id
      LEFT JOIN (
        SELECT
          op.member_id,
          COUNT(*)::bigint AS participation_count
        FROM otokogi_participants op
        JOIN otokogi_events oe ON oe.id = op.otokogi_event_id
        ${participantWhere}
        GROUP BY op.member_id
      ) part ON part.member_id = m.id
      ORDER BY payer.total_paid DESC`

    const ranking = rows.map((row, index) => {
      const count = Number(row.count)
      const participationCount = Number(row.participation_count)
      return {
        rank: index + 1,
        memberId: row.member_id,
        name: row.name,
        initial: row.initial,
        colorBg: row.color_bg,
        colorText: row.color_text,
        count,
        totalPaid: Number(row.total_paid),
        clutchCount: Number(row.clutch_count),
        participationCount,
        // 男気率 = 支払回数 / 参加回数 (参加 0 は 0 扱い)
        otokogiRate: participationCount > 0 ? count / participationCount : 0,
      }
    })

    const response = NextResponse.json({ ranking })
    // クライアントキャッシュ: 60秒有効 + 300秒のstale-while-revalidate
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
    return response
  } catch (error) {
    return handleApiError(error, { logLabel: 'ランキング取得エラー', fallbackMessage: 'ランキングの取得に失敗しました' })
  }
}
