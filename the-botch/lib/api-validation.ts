// API Route 共通のリクエストボディ検証ユーティリティ
//
// App Router の Route Handler には Pages Router の `export const config`
// (bodyParser.sizeLimit) が適用されないため、ボディサイズ制限は
// readJsonBody() で明示的に enforce する。
import { NextResponse } from 'next/server'
import { z } from 'zod'

/** JSON リクエストボディの最大サイズ（1MB）。内部ツールのため大きなアップロードは不要 */
export const MAX_BODY_BYTES = 1024 * 1024

/** participantIds / debtorIds 等のメンバー ID 配列の最大件数 */
export const MAX_PARTICIPANTS = 50

type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse }

/**
 * リクエストボディをサイズ制限付きで読み取り、JSON としてパースする。
 * 上限超過・不正な JSON の場合は 400 レスポンスを返す。
 * ストリームを逐次読みし、上限を超えた時点で読み込みを打ち切る。
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES
): Promise<JsonBodyResult> {
  const tooLarge = (): JsonBodyResult => ({
    ok: false,
    response: NextResponse.json(
      { error: `リクエストボディが大きすぎます（上限 ${Math.floor(maxBytes / 1024)}KB）` },
      { status: 400 }
    ),
  })

  // Content-Length ヘッダーで事前チェック（偽装可能なため実サイズも確認する）
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (Number.isFinite(declared) && declared > maxBytes) {
      return tooLarge()
    }
  }

  const chunks: Uint8Array[] = []
  let received = 0
  if (request.body) {
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel().catch(() => {})
        return tooLarge()
      }
      chunks.push(value)
    }
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(buffer))
    return { ok: true, body }
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'リクエストボディの JSON 形式が正しくありません' },
        { status: 400 }
      ),
    }
  }
}

/** Zod バリデーションエラーを 400 レスポンスに変換する */
export function validationErrorResponse(error: z.ZodError): NextResponse {
  const message = error.issues[0]?.message ?? '入力内容が正しくありません'
  return NextResponse.json({ error: message }, { status: 400 })
}

// ラベルはユーザー向けの日本語表記（例: 'イベント名', '金額'）を前提とする。
// 入力必須・形式不正・上限超過などのメッセージはすべて日本語で組み立てる。

/** ID 文字列（UUID 想定） */
export const idString = (label: string) =>
  z
    .string({ error: `${label}は文字列で入力してください` })
    .min(1, { error: `${label}は必須項目です` })
    .max(36, { error: `${label}の形式が正しくありません` })

/** 上限文字数付き文字列 */
export const limitedString = (label: string, max: number) =>
  z
    .string({ error: `${label}は文字列で入力してください` })
    .max(max, { error: `${label}は${max}文字以内で入力してください` })

/** 日付文字列（new Date() でパース可能な形式を想定） */
export const dateString = (label: string) =>
  z
    .string({ error: `${label}は文字列で入力してください` })
    .min(1, { error: `${label}は必須項目です` })
    .max(40, { error: `${label}の形式が正しくありません` })

/** 1以上の整数（金額等）。Int カラムの範囲を超えないよう上限も設ける */
export const positiveInt = (label: string) =>
  z
    .number({ error: `${label}は1以上の整数を入力してください` })
    .int({ error: `${label}は1以上の整数を入力してください` })
    .positive({ error: `${label}は1以上の整数を入力してください` })
    .max(1_000_000_000, { error: `${label}が大きすぎます` })

/** メンバー ID 配列（最大 MAX_PARTICIPANTS 件） */
export const memberIdArray = (label: string) =>
  z
    .array(idString(label), { error: `${label}の形式が正しくありません` })
    .max(MAX_PARTICIPANTS, { error: `${label}は最大${MAX_PARTICIPANTS}件までです` })
