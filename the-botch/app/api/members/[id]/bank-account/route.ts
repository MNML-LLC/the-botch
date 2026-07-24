import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { AccountType } from '@/lib/generated/prisma/client'
import { readJsonBody, validationErrorResponse } from '@/lib/api-validation'

type Params = { params: Promise<{ id: string }> }

// リクエストボディ検証スキーマ（文字列長は DB の VarChar 定義に対応）
const bankAccountSchema = z.object({
  bankName: z
    .string({ error: '銀行名を入力してください' })
    .trim()
    .min(1, { error: '銀行名を入力してください' })
    .max(50, { error: '銀行名は50文字以内で入力してください' }),
  branchName: z
    .string({ error: '支店名を入力してください' })
    .trim()
    .min(1, { error: '支店名を入力してください' })
    .max(50, { error: '支店名は50文字以内で入力してください' }),
  accountType: z.enum(AccountType, { error: '口座種別が不正です' }),
  accountNumber: z
    .string({ error: '口座番号を入力してください' })
    .regex(/^\d{1,7}$/, { error: '口座番号は7桁以下の数字で入力してください' }),
  accountHolder: z
    .string({ error: '口座名義を入力してください' })
    .trim()
    .min(1, { error: '口座名義を入力してください' })
    .max(100, { error: '口座名義は100文字以内で入力してください' }),
})

// GET /api/members/[id]/bank-account — 口座情報取得
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // メンバー存在チェック
    const member = await prisma.member.findUnique({ where: { id } })
    if (!member) {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }

    const bankAccount = await prisma.bankAccount.findUnique({
      where: { memberId: id },
    })

    // 未登録の場合はnullを返す
    return NextResponse.json(bankAccount, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    return handleApiError(error, { logLabel: '口座情報取得エラー', fallbackMessage: '口座情報の取得に失敗しました' })
  }
}

// PUT /api/members/[id]/bank-account — 口座情報登録・更新（upsert）
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = bankAccountSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    // bankName / branchName / accountHolder はスキーマの .trim() で整形済み
    const { bankName, branchName, accountType, accountNumber, accountHolder } = result.data

    const bankAccount = await prisma.bankAccount.upsert({
      where: { memberId: id },
      update: {
        bankName,
        branchName,
        accountType,
        accountNumber,
        accountHolder,
      },
      create: {
        memberId: id,
        bankName,
        branchName,
        accountType,
        accountNumber,
        accountHolder,
      },
    })

    return NextResponse.json(bankAccount)
  } catch (error) {
    return handleApiError(error, {
      logLabel: '口座情報更新エラー',
      fallbackMessage: '口座情報の更新に失敗しました',
      prismaMessages: { P2003: 'メンバーが見つかりません' },
    })
  }
}

// DELETE /api/members/[id]/bank-account — 口座情報削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // FK制約があるため、bankAccountの削除のみで十分（P2025で存在チェック兼用）
    await prisma.bankAccount.delete({
      where: { memberId: id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '口座情報削除エラー',
      fallbackMessage: '口座情報の削除に失敗しました',
      prismaMessages: { P2025: '口座情報が登録されていません' },
    })
  }
}
