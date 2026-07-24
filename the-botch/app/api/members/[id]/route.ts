import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { readJsonBody, validationErrorResponse, limitedString } from '@/lib/api-validation'

type Params = { params: Promise<{ id: string }> }

// リクエストボディ検証スキーマ（部分更新のため全フィールド optional）
const updateMemberSchema = z.object({
  name: limitedString('name', 100).min(1, { error: 'name は必須です' }).optional(),
  fullName: limitedString('fullName', 100).min(1, { error: 'fullName は必須です' }).optional(),
  initial: limitedString('initial', 1).min(1, { error: 'initial は必須です' }).optional(),
  colorBg: limitedString('colorBg', 50).optional(),
  colorText: limitedString('colorText', 50).optional(),
  paypayId: limitedString('paypayId', 100).nullable().optional(),
  isActive: z.boolean({ error: 'isActive は真偽値で指定してください' }).optional(),
})

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

    return NextResponse.json(member, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
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
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = updateMemberSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { name, fullName, initial, colorBg, colorText, paypayId, isActive } = result.data

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
