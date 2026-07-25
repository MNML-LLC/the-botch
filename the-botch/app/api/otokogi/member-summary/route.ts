import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'

type ShouldHavePaidRow = {
  member_id: string
  should_have_paid: bigint
}

type MaxSingleOtokogiRow = {
  member_id: string
  max_single_otokogi: bigint
}

function buildShouldHavePaidQuery(fromDate: Date | null, toDate: Date | null) {
  if (fromDate && toDate) {
    return prisma.$queryRaw<ShouldHavePaidRow[]>`
      SELECT op.member_id,
        ROUND(SUM(oe.amount::float / GREATEST(cnt.pc, 1)::float))::bigint AS should_have_paid
      FROM otokogi_participants op
      JOIN otokogi_events oe ON op.otokogi_event_id = oe.id
      JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
        ON oe.id = cnt.otokogi_event_id
      WHERE oe.event_date >= ${fromDate} AND oe.event_date <= ${toDate}
      GROUP BY op.member_id`
  }
  if (fromDate) {
    return prisma.$queryRaw<ShouldHavePaidRow[]>`
      SELECT op.member_id,
        ROUND(SUM(oe.amount::float / GREATEST(cnt.pc, 1)::float))::bigint AS should_have_paid
      FROM otokogi_participants op
      JOIN otokogi_events oe ON op.otokogi_event_id = oe.id
      JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
        ON oe.id = cnt.otokogi_event_id
      WHERE oe.event_date >= ${fromDate}
      GROUP BY op.member_id`
  }
  if (toDate) {
    return prisma.$queryRaw<ShouldHavePaidRow[]>`
      SELECT op.member_id,
        ROUND(SUM(oe.amount::float / GREATEST(cnt.pc, 1)::float))::bigint AS should_have_paid
      FROM otokogi_participants op
      JOIN otokogi_events oe ON op.otokogi_event_id = oe.id
      JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
        ON oe.id = cnt.otokogi_event_id
      WHERE oe.event_date <= ${toDate}
      GROUP BY op.member_id`
  }
  return prisma.$queryRaw<ShouldHavePaidRow[]>`
    SELECT op.member_id,
      ROUND(SUM(oe.amount::float / GREATEST(cnt.pc, 1)::float))::bigint AS should_have_paid
    FROM otokogi_participants op
    JOIN otokogi_events oe ON op.otokogi_event_id = oe.id
    JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
      ON oe.id = cnt.otokogi_event_id
    GROUP BY op.member_id`
}

function buildMaxSingleOtokogiQuery(fromDate: Date | null, toDate: Date | null) {
  if (fromDate && toDate) {
    return prisma.$queryRaw<MaxSingleOtokogiRow[]>`
      SELECT oe.payer_id AS member_id,
        ROUND(MAX(oe.amount::float * (cnt.pc - 1)::float / GREATEST(cnt.pc, 1)::float))::bigint AS max_single_otokogi
      FROM otokogi_events oe
      JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
        ON oe.id = cnt.otokogi_event_id
      WHERE oe.event_date >= ${fromDate} AND oe.event_date <= ${toDate}
      GROUP BY oe.payer_id`
  }
  if (fromDate) {
    return prisma.$queryRaw<MaxSingleOtokogiRow[]>`
      SELECT oe.payer_id AS member_id,
        ROUND(MAX(oe.amount::float * (cnt.pc - 1)::float / GREATEST(cnt.pc, 1)::float))::bigint AS max_single_otokogi
      FROM otokogi_events oe
      JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
        ON oe.id = cnt.otokogi_event_id
      WHERE oe.event_date >= ${fromDate}
      GROUP BY oe.payer_id`
  }
  if (toDate) {
    return prisma.$queryRaw<MaxSingleOtokogiRow[]>`
      SELECT oe.payer_id AS member_id,
        ROUND(MAX(oe.amount::float * (cnt.pc - 1)::float / GREATEST(cnt.pc, 1)::float))::bigint AS max_single_otokogi
      FROM otokogi_events oe
      JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
        ON oe.id = cnt.otokogi_event_id
      WHERE oe.event_date <= ${toDate}
      GROUP BY oe.payer_id`
  }
  return prisma.$queryRaw<MaxSingleOtokogiRow[]>`
    SELECT oe.payer_id AS member_id,
      ROUND(MAX(oe.amount::float * (cnt.pc - 1)::float / GREATEST(cnt.pc, 1)::float))::bigint AS max_single_otokogi
    FROM otokogi_events oe
    JOIN (SELECT otokogi_event_id, COUNT(*) AS pc FROM otokogi_participants GROUP BY otokogi_event_id) cnt
      ON oe.id = cnt.otokogi_event_id
    GROUP BY oe.payer_id`
}

// GET /api/otokogi/member-summary
// クエリパラメータ:
//   from=YYYY-MM-DD    — 開始日
//   to=YYYY-MM-DD      — 終了日
//   memberIds=id1,id2  — 表示するメンバー絞り込み（省略時は全員）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const memberIdsParam = searchParams.get('memberIds')
    const memberIdList = memberIdsParam ? memberIdsParam.split(',').filter(Boolean) : []

    const fromDate = from ? new Date(from) : null
    const toDate = to ? new Date(to) : null

    const hasDateFilter = !!(fromDate || toDate)
    const eventDateFilter = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    }
    const eventWhere = hasDateFilter ? { eventDate: eventDateFilter } : {}

    const [members, payerStats, participationStats, shouldHavePaidRows, maxSingleOtokogiRows] =
      await Promise.all([
        prisma.member.findMany({
          where: {
            isActive: true,
            ...(memberIdList.length > 0 ? { id: { in: memberIdList } } : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.otokogiEvent.groupBy({
          by: ['payerId'],
          where: eventWhere,
          _count: true,
          _sum: { amount: true },
        }),
        prisma.otokogiParticipant.groupBy({
          by: ['memberId'],
          where: hasDateFilter ? { otokogiEvent: { eventDate: eventDateFilter } } : undefined,
          _count: true,
        }),
        buildShouldHavePaidQuery(fromDate, toDate),
        buildMaxSingleOtokogiQuery(fromDate, toDate),
      ])

    const payerMap = new Map(
      payerStats.map((s) => [s.payerId, { count: s._count, actualPaid: s._sum.amount ?? 0 }])
    )
    const participationMap = new Map(participationStats.map((s) => [s.memberId, s._count]))
    const shouldHavePaidMap = new Map(
      shouldHavePaidRows.map((r) => [r.member_id, Number(r.should_have_paid)])
    )
    const maxSingleOtokogiMap = new Map(
      maxSingleOtokogiRows.map((r) => [r.member_id, Number(r.max_single_otokogi)])
    )

    const result = members.map((member) => {
      const payer = payerMap.get(member.id)
      const participationCount = participationMap.get(member.id) ?? 0
      const payerCount = payer?.count ?? 0
      const actualPaid = payer?.actualPaid ?? 0
      const shouldHavePaid = shouldHavePaidMap.get(member.id) ?? 0

      return {
        memberId: member.id,
        memberName: member.name,
        participationCount,
        payerCount,
        payerRate: participationCount > 0 ? payerCount / participationCount : 0,
        actualPaid,
        shouldHavePaid,
        otokogiAmount: actualPaid - shouldHavePaid,
        averagePaymentAmount: payerCount > 0 ? Math.round(actualPaid / payerCount) : 0,
        maxSingleOtokogi: maxSingleOtokogiMap.get(member.id) ?? 0,
        jankenWinRate: null as number | null,
      }
    })

    return NextResponse.json({
      members: result,
      hasJankenData: false,
    })
  } catch (error) {
    return handleApiError(error, { logLabel: '収支分析取得エラー', fallbackMessage: '収支分析データの取得に失敗しました' })
  }
}
