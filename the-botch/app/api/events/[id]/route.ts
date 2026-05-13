import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isMsGraphEnabled, updateOutlookEvent, deleteOutlookEvent } from '@/lib/msgraph'

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
          include: { payer: { select: memberSelect } },
        },
        warikanEvents: {
          include: { manager: { select: memberSelect } },
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
    const body = await request.json()
    const { title, date, endDate, description, eventType, participantIds } = body

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
            create: (participantIds as string[]).map((memberId: string) => ({ memberId })),
          },
        }),
      },
      include: {
        createdBy: true,
        participants: { include: { member: { select: { id: true, name: true, email: true } } } },
      },
    })

    // Outlook 同期 (ベストエフォート)
    if (isMsGraphEnabled() && event.outlookEventId) {
      try {
        const attendeeEmails = event.participants
          .map((p) => p.member.email)
          .filter((e): e is string => e !== null)

        await updateOutlookEvent(event.outlookEventId, {
          title: event.title,
          date: event.date,
          endDate: event.endDate,
          description: event.description,
          attendeeEmails,
        })
      } catch (syncErr) {
        console.error('[msgraph] updateOutlookEvent 失敗 eventId=%s:', id, syncErr)
      }
    }

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

    // Outlook 同期: DB 削除前に outlookEventId を取得
    let outlookEventId: string | null = null
    if (isMsGraphEnabled()) {
      const existing = await prisma.event.findUnique({
        where: { id },
        select: { outlookEventId: true },
      })
      outlookEventId = existing?.outlookEventId ?? null
    }

    await prisma.event.delete({ where: { id } })

    // Outlook 側のイベントを削除 (ベストエフォート)
    if (outlookEventId) {
      try {
        await deleteOutlookEvent(outlookEventId)
      } catch (syncErr) {
        console.error('[msgraph] deleteOutlookEvent 失敗 eventId=%s:', id, syncErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('イベント削除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ error: 'イベントの削除に失敗しました' }, { status: 500 })
  }
}
