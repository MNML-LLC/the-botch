import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

// GET /api/members/[id] — メンバー詳細
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const member = await prisma.member.findUnique({
      where: { id },
    })

    if (!member) {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(member)
  } catch (error) {
    console.error('メンバー詳細取得エラー:', error)
    return NextResponse.json(
      { error: 'メンバー詳細の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// PUT /api/members/[id] — メンバー更新
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, fullName, initial, colorBg, colorText, paypayId, isActive } = body

    const member = await prisma.member.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(fullName !== undefined && { fullName }),
        ...(initial !== undefined && { initial }),
        ...(colorBg !== undefined && { colorBg }),
        ...(colorText !== undefined && { colorText }),
        ...(paypayId !== undefined && { paypayId }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json(member)
  } catch (error) {
    console.error('メンバー更新エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'メンバーの更新に失敗しました' },
      { status: 500 }
    )
  }
}

// DELETE /api/members/[id] — メンバー削除（論理削除）
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const member = await prisma.member.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json(member)
  } catch (error) {
    console.error('メンバー削除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'メンバーの削除に失敗しました' },
      { status: 500 }
    )
  }
}
