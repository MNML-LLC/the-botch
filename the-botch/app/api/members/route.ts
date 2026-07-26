import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { readJsonBody } from '@/lib/api-validation'
import { createMemberSchema } from '@/lib/schemas/members'

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
    return handleApiError(error, { logLabel: 'メンバー一覧取得エラー', fallbackMessage: 'メンバー一覧の取得に失敗しました' })
  }
}

// POST /api/members — メンバー作成
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createMemberSchema.safeParse(parsed.body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation error', details: result.error.issues },
        { status: 400 },
      )
    }

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
    return handleApiError(error, {
      logLabel: 'メンバー作成エラー',
      fallbackMessage: 'メンバーの作成に失敗しました',
      prismaMessages: { P2002: 'その名前は既に使用されています' },
    })
  }
}
