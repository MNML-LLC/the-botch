import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Raw SQL 結果型
type RankingRow = {
  member_id: string
  name: string
  initial: string
  color_bg: string
  color_text: string
  count: bigint
  total_paid: bigint
}

// GET /api/otokogi/ranking — 男気ランキング（Raw SQL JOIN 1クエリ化）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')

    // Raw SQL で JOIN して1クエリ化（2クエリ → 1クエリ）
    const rows: RankingRow[] = year
      ? await prisma.$queryRaw<RankingRow[]>`
          SELECT
            m.id AS member_id,
            m.name,
            m.initial,
            m.color_bg,
            m.color_text,
            COUNT(*)::bigint AS count,
            SUM(oe.amount)::bigint AS total_paid
          FROM otokogi_events oe
          JOIN members m ON oe.payer_id = m.id
          WHERE oe.event_date >= ${new Date(`${year}-01-01`)} AND oe.event_date < ${new Date(`${Number(year) + 1}-01-01`)}
          GROUP BY m.id, m.name, m.initial, m.color_bg, m.color_text
          ORDER BY total_paid DESC`
      : await prisma.$queryRaw<RankingRow[]>`
          SELECT
            m.id AS member_id,
            m.name,
            m.initial,
            m.color_bg,
            m.color_text,
            COUNT(*)::bigint AS count,
            SUM(oe.amount)::bigint AS total_paid
          FROM otokogi_events oe
          JOIN members m ON oe.payer_id = m.id
          GROUP BY m.id, m.name, m.initial, m.color_bg, m.color_text
          ORDER BY total_paid DESC`

    const ranking = rows.map((row, index) => ({
      rank: index + 1,
      memberId: row.member_id,
      name: row.name,
      initial: row.initial,
      colorBg: row.color_bg,
      colorText: row.color_text,
      count: Number(row.count),
      totalPaid: Number(row.total_paid),
    }))

    const response = NextResponse.json({ ranking })
    // クライアントキャッシュ: 60秒有効 + 300秒のstale-while-revalidate
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
    return response
  } catch (error) {
    console.error('ランキング取得エラー:', error)
    return NextResponse.json(
      { error: 'ランキングの取得に失敗しました' },
      { status: 500 }
    )
  }
}
