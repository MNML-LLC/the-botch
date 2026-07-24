import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { EventType } from '@/lib/generated/prisma/client'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  dateString,
  memberIdArray,
} from '@/lib/api-validation'

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

    const events = await prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        date: true,
        endDate: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
        _count: {
          select: { participants: true },
        },
        otokogiEvents: { select: { id: true } },
        warikanEvents: { select: { id: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(events, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('イベント一覧取得エラー:', error)
    return NextResponse.json({ error: 'イベント一覧の取得に失敗しました' }, { status: 500 })
  }
}

// リクエストボディ検証スキーマ（title は DB の VarChar(200) に対応）
const createEventSchema = z.object({
  title: limitedString('title', 200).min(1, { error: 'タイトル、日付、作成者は必須です' }),
  date: dateString('date'),
  endDate: dateString('endDate').nullable().optional(),
  description: limitedString('description', 1000).nullable().optional(),
  eventType: z.enum(EventType, { error: 'eventType が不正です' }).optional(),
  createdById: idString('createdById'),
  participantIds: memberIdArray('participantIds').optional(),
})

// POST /api/events — イベント作成
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createEventSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { title, date, endDate, description, eventType, createdById, participantIds } = result.data

    const event = await prisma.event.create({
      data: {
        title,
        date: new Date(date),
        endDate: endDate ? new Date(endDate) : null,
        description: description || null,
        eventType: eventType || 'HANGOUT',
        createdById,
        participants: {
          create: (participantIds ?? []).map((memberId) => ({
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
