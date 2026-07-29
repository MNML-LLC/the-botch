import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'

type Params = { params: Promise<{ id: string }> }

// POST /api/warikan/[id]/settlements/bulk-complete
// 全精算レコードを isPaid=true / isReceived=true に一括更新し、
// 割り勘イベントを CLOSED に遷移する。
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    if (warikanEvent.status !== 'PAYING') {
      return NextResponse.json(
        { error: '送金中のイベントのみ一括完了できます' },
        { status: 400 }
      )
    }

    const settlementCount = await prisma.warikanSettlement.count({
      where: { warikanEventId: id },
    })

    if (settlementCount === 0) {
      return NextResponse.json(
        { error: '精算レコードが存在しません' },
        { status: 400 }
      )
    }

    const now = new Date()

    const result = await prisma.$transaction(async (tx) => {
      // 未送金レコードのみ paidAt を設定し、それ以外は既存値を維持
      await tx.warikanSettlement.updateMany({
        where: { warikanEventId: id, isPaid: false },
        data: { isPaid: true, paidAt: now },
      })
      // 未受領レコードのみ receivedAt を設定
      await tx.warikanSettlement.updateMany({
        where: { warikanEventId: id, isReceived: false },
        data: { isReceived: true, receivedAt: now },
      })

      return tx.warikanEvent.update({
        where: { id },
        data: { status: 'CLOSED' },
      })
    })

    return NextResponse.json({
      event: result,
      updatedCount: settlementCount,
    })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '精算一括完了エラー',
      fallbackMessage: '精算の一括完了に失敗しました',
    })
  }
}
