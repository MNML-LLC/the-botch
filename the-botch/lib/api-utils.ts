// API Route 共通のエラーハンドリングユーティリティ
//
// 各 Route Handler の catch ブロックで重複していた
// 「console.error + NextResponse.json エラー返却」パターンを共通化する。
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validationErrorResponse } from '@/lib/api-validation'

/** Prisma 既知エラーコード → HTTP ステータスの対応 */
const PRISMA_ERROR_STATUS = {
  /** 一意制約違反 */
  P2002: 409,
  /** 外部キー制約違反（参照先レコードなし） */
  P2003: 404,
  /** 対象レコードなし */
  P2025: 404,
} as const

type PrismaErrorCode = keyof typeof PRISMA_ERROR_STATUS

export interface HandleApiErrorOptions {
  /** console.error に出力するログラベル（例: 'メンバー作成エラー'） */
  logLabel: string
  /** 想定外エラー時に 500 で返すメッセージ */
  fallbackMessage: string
  /**
   * Prisma エラーコード → クライアント向けメッセージ。
   * 指定したコードのみ対応する HTTP ステータスで返す。
   * 未指定のコードは従来どおり 500 フォールバックとなる。
   */
  prismaMessages?: Partial<Record<PrismaErrorCode, string>>
}

/** error から Prisma エラーコード相当の code 文字列を取り出す */
function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

/**
 * API Route の catch ブロック共通処理。
 * エラーをログ出力し、既知エラー型を分類して適切な HTTP ステータスで返す。
 */
export function handleApiError(error: unknown, options: HandleApiErrorOptions): NextResponse {
  console.error(`${options.logLabel}:`, error)

  // Zod バリデーションエラー（通常は safeParse で事前処理されるが、throw された場合の保険）
  if (error instanceof z.ZodError) {
    return validationErrorResponse(error)
  }

  const code = getErrorCode(error)
  if (code !== undefined && options.prismaMessages) {
    const message = options.prismaMessages[code as PrismaErrorCode]
    if (message !== undefined) {
      return NextResponse.json(
        { error: message },
        { status: PRISMA_ERROR_STATUS[code as PrismaErrorCode] }
      )
    }
  }

  return NextResponse.json({ error: options.fallbackMessage }, { status: 500 })
}
