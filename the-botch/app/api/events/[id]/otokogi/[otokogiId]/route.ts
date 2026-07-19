import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; otokogiId: string }> }

// DELETE /api/events/[id]/otokogi/[otokogiId] — 男気イベントの紐付け解除 (eventId → null)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, otokogiId } = await params

    const event = await prisma.event.findUnique({ where: { id }, select: { id: true } })
    if (!event) {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
    }

    await prisma.otokogiEvent.update({
      where: { id: otokogiId, eventId: id },
      data: { eventId: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('男気イベント紐付け解除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: '男気イベントが見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ error: '紐付け解除に失敗しました' }, { status: 500 })
  }
}
