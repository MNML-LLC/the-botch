// 男気 API のリクエストボディ検証スキーマ
//
// 文字列長は DB カラム定義に対応。共通のプリミティブは api-validation.ts から再利用する。
import { z } from 'zod'
import {
  idString,
  limitedString,
  dateString,
  positiveInt,
  memberIdArray,
} from '@/lib/api-validation'

/** POST /api/otokogi — 男気イベント作成のボディ */
export const createOtokogiSchema = z.object({
  eventDate: dateString('eventDate'),
  eventName: limitedString('eventName', 100).min(1, { error: 'eventName は必須です' }),
  payerId: idString('payerId'),
  amount: positiveInt('amount'),
  place: limitedString('place', 100).nullable().optional(),
  hasAlbum: z.boolean({ error: 'hasAlbum は真偽値で指定してください' }).optional(),
  memo: limitedString('memo', 1000).nullable().optional(),
  eventId: idString('eventId').nullable().optional(),
  participantIds: memberIdArray('participantIds').min(1, {
    error: 'participantIds（参加者配列）は必須です',
  }),
})

export type CreateOtokogiInput = z.infer<typeof createOtokogiSchema>
