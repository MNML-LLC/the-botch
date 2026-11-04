import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import {
  computeFyBadges,
  type FyBadgeOtokogiEvent,
  type FyBadgeMember,
} from '@/lib/otokogi-fy-badges'

// GET /api/otokogi/fy-badges
// 全 OtokogiEvent を走査し、FY (11月開始) ごとに独立計算したバッジを返す。
// クエリパラメータなし (全 FY を返す)。
export async function GET() {
  try {
    const [members, events] = await Promise.all([
      prisma.member.findMany({
        where: { isActive: true },
        select: { id: true, name: true, initial: true, colorBg: true, colorText: true },
        orderBy: { name: 'asc' },
      }),
      prisma.otokogiEvent.findMany({
        select: {
          id: true,
          eventDate: true,
          amount: true,
          payerId: true,
          participants: { select: { memberId: true } },
        },
        orderBy: { eventDate: 'asc' },
      }),
    ])

    const fyEvents: FyBadgeOtokogiEvent[] = events.map((e) => ({
      id: e.id,
      eventDate: e.eventDate,
      amount: e.amount,
      payerId: e.payerId,
      participantIds: e.participants.map((p) => p.memberId),
    }))
    const fyMembers: FyBadgeMember[] = members.map((m) => ({ id: m.id, name: m.name }))

    const results = computeFyBadges(fyEvents, fyMembers)

    // Map<string, Badge[]> は JSON にできないため平坦化する
    const fiscalYears = results.map((r) => ({
      fy: r.fy,
      shortLabel: r.shortLabel,
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      eventCount: r.eventCount,
      totalAmount: r.totalAmount,
      aggregates: r.aggregates,
      badges: Array.from(r.badgesByMember.entries()).map(([memberId, badges]) => ({
        memberId,
        badges,
      })),
    }))

    const response = NextResponse.json({ fiscalYears, members })
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=900')
    return response
  } catch (error) {
    return handleApiError(error, {
      logLabel: 'FY バッジ取得エラー',
      fallbackMessage: 'FY バッジの取得に失敗しました',
    })
  }
}
