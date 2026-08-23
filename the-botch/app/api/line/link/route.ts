// POST /api/line/link
//
// LIFF から呼び出され、LINE ID Token を検証したうえで Member と
// LINE アカウントを紐付ける（`MemberLineAccount` を upsert）。
//
// - `LINE_CHANNEL_SECRET`（もしくは `LINE_LOGIN_CHANNEL_ID` / `NEXT_PUBLIC_LIFF_ID`）
//   が未設定の場合は 503 を返す（LIFF 未設定の段階で誤って叩かれても安全側に倒す）。
// - Bearer 認証は課さない（LIFF 由来の ID Token 自体が身元証明）。
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { readJsonBody, validationErrorResponse, idString } from '@/lib/api-validation'
import { verifyLineIdToken, LineTokenVerifyError } from '@/lib/line/verifyToken'

const linkSchema = z.object({
  idToken: z
    .string({ error: 'idToken は文字列で入力してください' })
    .min(1, { error: 'idToken は必須項目です' })
    .max(4096, { error: 'idToken の形式が正しくありません' }),
  memberId: idString('メンバー ID'),
})

function isLineLoginConfigured(): boolean {
  return Boolean(
    process.env.LINE_LOGIN_CHANNEL_ID ||
      process.env.NEXT_PUBLIC_LIFF_ID ||
      process.env.LINE_CHANNEL_SECRET,
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!isLineLoginConfigured()) {
      return NextResponse.json(
        { error: 'LINE 連携は現在利用できません' },
        { status: 503 },
      )
    }

    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = linkSchema.safeParse(parsed.body)
    if (!result.success) {
      return validationErrorResponse(result.error)
    }

    const { idToken, memberId } = result.data

    // メンバーの存在確認（FK エラーでも 404 になるが、事前確認で明確にする）
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, isActive: true },
    })
    if (!member) {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 },
      )
    }

    let payload
    try {
      payload = await verifyLineIdToken(idToken)
    } catch (error) {
      if (error instanceof LineTokenVerifyError) {
        if (error.reason === 'missing_secret') {
          return NextResponse.json(
            { error: 'LINE 連携は現在利用できません' },
            { status: 503 },
          )
        }
        console.warn('[api/line/link] LINE ID Token 検証失敗:', error.message)
        return NextResponse.json(
          { error: 'LINE 認証に失敗しました' },
          { status: 401 },
        )
      }
      throw error
    }

    const lineUserId = payload.sub
    const displayName = payload.name ?? null

    const account = await prisma.memberLineAccount.upsert({
      where: { memberId },
      create: {
        memberId,
        lineUserId,
        displayName,
        isActive: true,
      },
      update: {
        lineUserId,
        displayName,
        isActive: true,
      },
    })

    return NextResponse.json({
      id: account.id,
      memberId: account.memberId,
      displayName: account.displayName,
      linkedAt: account.linkedAt,
    })
  } catch (error) {
    return handleApiError(error, {
      logLabel: 'LINE 連携エラー',
      fallbackMessage: 'LINE 連携に失敗しました',
      prismaMessages: {
        P2002: 'この LINE アカウントは既に別のメンバーに紐付いています',
        P2003: 'メンバーが見つかりません',
      },
    })
  }
}
