// 割り勘 API のリクエストボディ検証スキーマ
//
// 文字列長は DB カラム定義に対応。共通のプリミティブは api-validation.ts から再利用する。
import { z } from 'zod'
import {
  idString,
  limitedString,
  dateString,
  memberIdArray,
} from '@/lib/api-validation'

/** POST /api/warikan — 割り勘イベント作成のボディ */
export const createWarikanSchema = z.object({
  eventName: limitedString('イベント名', 200).min(1, { error: 'イベント名は必須項目です' }),
  managerId: idString('管理大臣').nullable().optional(),
  detailDeadline: dateString('明細追加期日').nullable().optional(),
  paymentDeadline: dateString('支払期日').nullable().optional(),
  memo: limitedString('メモ', 1000).nullable().optional(),
  walicaUrl: limitedString('Walica URL', 255).nullable().optional(),
  eventId: idString('カレンダーイベント').nullable().optional(),
  participantIds: memberIdArray('参加メンバー').min(1, {
    error: '参加メンバーを1人以上選択してください',
  }),
})

export type CreateWarikanInput = z.infer<typeof createWarikanSchema>
