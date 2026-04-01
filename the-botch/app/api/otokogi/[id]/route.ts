import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidateStatsCache } from '@/lib/stats-cache'

type Params = { params: Promise<{ id: string }> }

// GET /api/otokogi/[id] — 男気イベント詳細
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const event = await prisma.otokogiEvent.findUnique({
      where: { id },
      include: {
        payer: true,
        participants: {
          include: { member: true },
        },
      },
    })

    if (!event) {
      return NextResponse.json(
        { error: '男気イベントが見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(event, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    console.error('男気イベント詳細取得エラー:', error)
    return NextResponse.json(
      { error: '男気イベント詳細の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// PUT /api/otokogi/[id] — 男気イベント更新
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { eventDate, eventName, payerId, amount, place, hasAlbum, memo, participantIds } = body

    const event = await prisma.$transaction(async (tx) => {
      // 参加者の更新がある場合は差し替え
      if (participantIds && Array.isArray(participantIds)) {
        await tx.otokogiParticipant.deleteMany({
          where: { otokogiEventId: id },
        })
        await tx.otokogiParticipant.createMany({
          data: (participantIds as string[]).map((memberId) => ({
            otokogiEventId: id,
            memberId,
          })),
        })
      }

      return tx.otokogiEvent.update({
        where: { id },
        data: {
          ...(eventDate !== undefined && { eventDate: new Date(eventDate) }),
          ...(eventName !== undefined && { eventName }),
          ...(payerId !== undefined && { payerId }),
          ...(amount !== undefined && { amount }),
          ...(place !== undefined && { place }),
          ...(hasAlbum !== undefined && { hasAlbum }),
          ...(memo !== undefined && { memo }),
        },
        include: {
          payer: true,
          participants: {
            include: { member: true },
          },
        },
      })
    })

    // 統計キャッシュ無効化（イベント更新で統計が変わる）
    invalidateStatsCache()

    return NextResponse.json(event)
  } catch (error) {
    console.error('男気イベント更新エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: '男気イベントが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '男気イベントの更新に失敗しました' },
      { status: 500 }
    )
  }
}

// DELETE /api/otokogi/[id] — 男気イベント削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await prisma.otokogiEvent.delete({
      where: { id },
    })

    // 統計キャッシュ無効化（イベント削除で統計が変わる）
    invalidateStatsCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('男気イベント削除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: '男気イベントが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '男気イベントの削除に失敗しました' },
      { status: 500 }
    )
  }
}
