import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/events — イベント一覧
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    const where: Record<string, unknown> = {}

    // 年月指定: その月の開始〜終了に重なるイベントを取得
    if (year && month) {
      const startDate = new Date(`${year}-${month.padStart(2, '0')}-01`)
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + 1)

      where.OR = [
        // 開始日がこの月内
        { date: { gte: startDate, lt: endDate } },
        // 終了日がこの月内（複数日イベント）
        { endDate: { gte: startDate, lt: endDate } },
        // この月をまたぐイベント
        { AND: [{ date: { lt: startDate } }, { endDate: { gte: endDate } }] },
      ]
    }

    const memberSelect = { id: true, name: true, initial: true, colorBg: true, colorText: true } as const

    const events = await prisma.event.findMany({
      where,
      include: {
        createdBy: { select: memberSelect },
        participants: { include: { member: { select: memberSelect } } },
        otokogiEvents: { select: { id: true, eventName: true, amount: true } },
        warikanEvents: { select: { id: true, eventName: true, status: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(events)
  } catch (error) {
    console.error('イベント一覧取得エラー:', error)
    return NextResponse.json({ error: 'イベント一覧の取得に失敗しました' }, { status: 500 })
  }
}

// POST /api/events — イベント作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, date, endDate, description, eventType, createdById, participantIds } = body

    if (!title || !date || !createdById) {
      return NextResponse.json({ error: 'タイトル、日付、作成者は必須です' }, { status: 400 })
    }

    const event = await prisma.event.create({
      data: {
        title,
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        description: description || null,
        eventType: eventType || 'HANGOUT',
        createdById,
        participants: {
          create: (participantIds as string[] ?? []).map((memberId: string) => ({
            memberId,
          })),
        },
      },
      include: {
        createdBy: true,
        participants: { include: { member: true } },
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error('イベント作成エラー:', error)
    return NextResponse.json({ error: 'イベントの作成に失敗しました' }, { status: 500 })
  }
}
