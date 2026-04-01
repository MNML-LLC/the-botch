import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

// POST /api/warikan/[id]/revert-to-entering — PAYING→ENTERINGに戻す
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
        { error: '送金中のイベントのみ明細修正に戻れます' },
        { status: 400 }
      )
    }

    // トランザクションで全Settlement削除 + ステータス変更
    const updated = await prisma.$transaction(async (tx) => {
      await tx.warikanSettlement.deleteMany({
        where: { warikanEventId: id },
      })

      return tx.warikanEvent.update({
        where: { id },
        data: { status: 'ENTERING' },
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('明細修正に戻すエラー:', error)
    return NextResponse.json(
      { error: '明細修正に戻す処理に失敗しました' },
      { status: 500 }
    )
  }
}
