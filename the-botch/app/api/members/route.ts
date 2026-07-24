import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { readJsonBody, validationErrorResponse, limitedString } from '@/lib/api-validation'

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

// リクエストボディ検証スキーマ（initial は DB の Char(1) に対応）
const createMemberSchema = z.object({
  name: limitedString('name', 100).min(1, { error: 'name は必須です' }),
  fullName: limitedString('fullName', 100).min(1, { error: 'fullName は必須です' }),
  initial: limitedString('initial', 1).min(1, { error: 'initial は必須です' }),
  colorBg: limitedString('colorBg', 50).optional(),
  colorText: limitedString('colorText', 50).optional(),
  paypayId: limitedString('paypayId', 100).nullable().optional(),
})

// POST /api/members — メンバー作成
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createMemberSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { name, fullName, initial, colorBg, colorText, paypayId } = result.data

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
