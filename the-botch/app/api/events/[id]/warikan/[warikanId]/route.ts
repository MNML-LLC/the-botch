import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'

type Params = { params: Promise<{ id: string; warikanId: string }> }

// DELETE /api/events/[id]/warikan/[warikanId] — 割り勘イベントの紐付け解除 (eventId → null)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, warikanId } = await params

    const event = await prisma.event.findUnique({ where: { id }, select: { id: true } })
    if (!event) {
      return NextResponse.json({ error: 'イベントが見つかりません' }, { status: 404 })
    }

    await prisma.warikanEvent.update({
      where: { id: warikanId, eventId: id },
      data: { eventId: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '割り勘イベント紐付け解除エラー',
      fallbackMessage: '紐付け解除に失敗しました',
      prismaMessages: { P2025: '割り勘イベントが見つかりません' },
    })
  }
}
