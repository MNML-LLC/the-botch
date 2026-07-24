import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { EventType } from '@/lib/generated/prisma/client'
import {
  readJsonBody,
  validationErrorResponse,
  limitedString,
  dateString,
  memberIdArray,
} from '@/lib/api-validation'

// リクエストボディ検証スキーマ（部分更新のため全フィールド optional）
const updateEventSchema = z.object({
  title: limitedString('title', 200).optional(),
  date: dateString('date').optional(),
  endDate: dateString('endDate').nullable().optional(),
  description: limitedString('description', 1000).nullable().optional(),
  eventType: z.enum(EventType, { error: 'eventType が不正です' }).optional(),
  participantIds: memberIdArray('participantIds').optional(),
})

// GET /api/events/:id — イベント詳細
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberSelect = { id: true, name: true, initial: true, colorBg: true, colorText: true } as const

    const { id } = await params
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: { select: memberSelect },
        participants: { include: { member: { select: memberSelect } } },
        otokogiEvents: {
          include: {
            payer: { select: memberSelect },
            participants: { include: { member: { select: memberSelect } } },
          },
          orderBy: { eventDate: 'desc' },
        },
        warikanEvents: {
          include: {
            manager: { select: memberSelect },
            participants: { include: { member: { select: memberSelect } } },
            _count: { select: { expenses: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!event) {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
    }

    return NextResponse.json(event, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    console.error('イベント取得エラー:', error)
    return NextResponse.json({ error: 'イベントの取得に失敗しました' }, { status: 500 })
  }
}

// PUT /api/events/:id — イベント更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = updateEventSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { title, date, endDate, description, eventType, participantIds } = result.data

    const event = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(date && { date: new Date(date) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(description !== undefined && { description }),
        ...(eventType && { eventType }),
        ...(participantIds && {
          participants: {
            deleteMany: {},
            create: participantIds.map((memberId) => ({ memberId })),
          },
        }),
      },
      include: {
        createdBy: true,
        participants: { include: { member: true } },
      },
    })

    return NextResponse.json(event)
  } catch (error) {
    console.error('イベント更新エラー:', error)
    return NextResponse.json({ error: 'イベントの更新に失敗しました' }, { status: 500 })
  }
}

// DELETE /api/events/:id — イベント削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.event.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('イベント削除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ error: 'イベントの削除に失敗しました' }, { status: 500 })
  }
}
