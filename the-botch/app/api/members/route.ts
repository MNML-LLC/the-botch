import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/members — メンバー一覧
export async function GET() {
  try {
    const members = await prisma.member.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { bankAccount: { select: { id: true } } },
    })
    // メンバーデータはユーザー固有のためprivate、5分キャッシュ
    return NextResponse.json(members, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('メンバー一覧取得エラー:', error)
    return NextResponse.json(
      { error: 'メンバー一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST /api/members — メンバー作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, fullName, initial, colorBg, colorText, paypayId } = body

    if (!name || !fullName || !initial) {
      return NextResponse.json(
        { error: 'name, fullName, initial は必須です' },
        { status: 400 }
      )
    }

    const member = await prisma.member.create({
      data: {
        name,
        fullName,
        initial,
        colorBg: colorBg ?? 'bg-gray-100',
        colorText: colorText ?? 'text-gray-700',
        paypayId: paypayId ?? null,
      },
    })

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    console.error('メンバー作成エラー:', error)
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'その名前は既に使用されています' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'メンバーの作成に失敗しました' },
      { status: 500 }
    )
  }
}
