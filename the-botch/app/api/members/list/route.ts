import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/members/list — LIFF 連携画面用。lineAccount の連携状態を含む
export async function GET() {
  try {
    const members = await prisma.member.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        lineAccount: {
          select: { isActive: true },
        },
      },
    })
    return NextResponse.json(members)
  } catch (error) {
    console.error('メンバー一覧取得エラー:', error)
    return NextResponse.json({ error: 'メンバー一覧の取得に失敗しました' }, { status: 500 })
  }
}
