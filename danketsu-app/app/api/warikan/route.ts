import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { WarikanStatus } from '@prisma/client'

// GET /api/warikan — 割り勘イベント一覧（フィルタ: status, year）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const year = searchParams.get('year')

    const where: Record<string, unknown> = {}

    if (status && Object.values(WarikanStatus).includes(status as WarikanStatus)) {
      where.status = status as WarikanStatus
    }

    if (year) {
      const startDate = new Date(`${year}-01-01`)
      const endDate = new Date(`${Number(year) + 1}-01-01`)
      where.createdAt = { gte: startDate, lt: endDate }
    }

    const events = await prisma.warikanEvent.findMany({
      where,
      include: {
        manager: true,
        participants: {
          include: { member: true },
        },
        _count: {
          select: { expenses: true, settlements: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(events)
  } catch (error) {
    console.error('割り勘イベント一覧取得エラー:', error)
    return NextResponse.json(
      { error: '割り勘イベント一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST /api/warikan — 割り勘イベント作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventName, managerId, detailDeadline, paymentDeadline, memo, walicaUrl, eventId, participantIds } = body

    if (!eventName) {
      return NextResponse.json(
        { error: 'eventName は必須です' },
        { status: 400 }
      )
    }

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: 'participantIds（参加者配列）は必須です' },
        { status: 400 }
      )
    }

    const event = await prisma.warikanEvent.create({
      data: {
        eventName,
        managerId: managerId ?? null,
        detailDeadline: detailDeadline ? new Date(detailDeadline) : null,
        paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
        memo: memo ?? null,
        walicaUrl: walicaUrl ?? null,
        eventId: eventId ?? null,
        participants: {
          create: (participantIds as string[]).map((memberId) => ({
            memberId,
          })),
        },
      },
      include: {
        manager: true,
        participants: {
          include: { member: true },
        },
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error('割り勘イベント作成エラー:', error)
    return NextResponse.json(
      { error: '割り勘イベントの作成に失敗しました' },
      { status: 500 }
    )
  }
}
