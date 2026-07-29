import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { readJsonBody, validationErrorResponse, limitedString } from '@/lib/api-validation'
import { MEMBER_SELECT } from '@/lib/prisma-selects'

type Params = { params: Promise<{ id: string }> }

// リクエストボディ検証スキーマ（部分更新のため全フィールド optional）
const updateMemberSchema = z.object({
  name: limitedString('ニックネーム', 100).min(1, { error: 'ニックネームは必須項目です' }).optional(),
  fullName: limitedString('フルネーム', 100).min(1, { error: 'フルネームは必須項目です' }).optional(),
  initial: limitedString('イニシャル', 1).min(1, { error: 'イニシャルは必須項目です' }).optional(),
  colorBg: limitedString('背景色', 50).optional(),
  colorText: limitedString('文字色', 50).optional(),
  paypayId: limitedString('PayPay ID', 100).nullable().optional(),
  isActive: z.boolean({ error: '有効/無効は true/false で指定してください' }).optional(),
})

// GET /api/members/[id] — メンバー詳細（参加イベント一覧・累計統計を含む）
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        otokogiParticipations: {
          select: {
            otokogiEvent: {
              select: {
                id: true,
                eventDate: true,
                eventName: true,
                amount: true,
                place: true,
                payer: { select: MEMBER_SELECT },
              },
            },
          },
          orderBy: { otokogiEvent: { eventDate: 'desc' } },
        },
        warikanParticipations: {
          select: {
            warikanEvent: {
              select: {
                id: true,
                eventName: true,
                status: true,
                detailDeadline: true,
                paymentDeadline: true,
                displayDate: true,
                createdAt: true,
              },
            },
          },
          orderBy: { warikanEvent: { createdAt: 'desc' } },
        },
      },
    })

    if (!member) {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }

    // 累計支払額の集計（男気: payer として支払った額、割り勘: 立替明細の合計額）
    const [otokogiPaidAgg, warikanPaidAgg] = await Promise.all([
      prisma.otokogiEvent.aggregate({
        where: { payerId: id },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.warikanExpense.aggregate({
        where: { payerId: id },
        _sum: { amount: true },
        _count: true,
      }),
    ])

    const otokogiPaidTotal = otokogiPaidAgg._sum.amount ?? 0
    const warikanPaidTotal = warikanPaidAgg._sum.amount ?? 0

    return NextResponse.json({
      ...member,
      stats: {
        otokogiParticipationCount: member.otokogiParticipations.length,
        warikanParticipationCount: member.warikanParticipations.length,
        otokogiPaidCount: otokogiPaidAgg._count,
        otokogiPaidTotal,
        warikanPaidCount: warikanPaidAgg._count,
        warikanPaidTotal,
        totalPaid: otokogiPaidTotal + warikanPaidTotal,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    return handleApiError(error, { logLabel: 'メンバー詳細取得エラー', fallbackMessage: 'メンバー詳細の取得に失敗しました' })
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
    return handleApiError(error, {
      logLabel: 'メンバー更新エラー',
      fallbackMessage: 'メンバーの更新に失敗しました',
      prismaMessages: { P2025: 'メンバーが見つかりません' },
    })
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
    return handleApiError(error, {
      logLabel: 'メンバー削除エラー',
      fallbackMessage: 'メンバーの削除に失敗しました',
      prismaMessages: { P2025: 'メンバーが見つかりません' },
    })
  }
}
