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
  eventName: limitedString('eventName', 200).min(1, { error: 'eventName は必須です' }),
  managerId: idString('managerId').nullable().optional(),
  detailDeadline: dateString('detailDeadline').nullable().optional(),
  paymentDeadline: dateString('paymentDeadline').nullable().optional(),
  memo: limitedString('memo', 1000).nullable().optional(),
  walicaUrl: limitedString('walicaUrl', 255).nullable().optional(),
  eventId: idString('eventId').nullable().optional(),
  participantIds: memberIdArray('participantIds').min(1, {
    error: 'participantIds（参加者配列）は必須です',
  }),
})

export type CreateWarikanInput = z.infer<typeof createWarikanSchema>
