import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyLineToken } from '@/lib/line/verifyToken'

// POST /api/line/link — LIFF から呼ばれて Member と LINE アカウントを紐付ける
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { idToken?: string; memberId?: string }
    const { idToken, memberId } = body

    if (!idToken || !memberId) {
      return NextResponse.json(
        { error: 'idToken と memberId は必須です' },
        { status: 400 },
      )
    }

    const member = await prisma.member.findUnique({ where: { id: memberId } })
    if (!member) {
      return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
    }

    const { sub, name } = await verifyLineToken(idToken)

    await prisma.memberLineAccount.upsert({
      where: { memberId },
      create: {
        memberId,
        lineUserId: sub,
        displayName: name ?? null,
        isActive: true,
      },
      update: {
        lineUserId: sub,
        displayName: name ?? null,
        isActive: true,
        linkedAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('LINE 連携エラー:', error)
    return NextResponse.json(
      { error: 'LINE 連携に失敗しました' },
      { status: 500 },
    )
  }
}
