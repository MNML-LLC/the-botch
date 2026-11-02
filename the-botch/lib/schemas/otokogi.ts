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
import { MIN_OTOKOGI_AMOUNT } from '@/lib/constants'

// 男気は ¥10,000 以上から成立する (CEO ルール / Issue #354)
// positiveInt の上で下限を上乗せすることで、1 円以上という最低限の形式検証とは別に
// 「男気として扱う」業務ルールをコードで強制する。
export const otokogiAmountSchema = positiveInt('金額').refine(
  (v) => v >= MIN_OTOKOGI_AMOUNT,
  { error: `男気は ¥${MIN_OTOKOGI_AMOUNT.toLocaleString()} 以上から成立します` }
)

/** POST /api/otokogi — 男気イベント作成のボディ */
export const createOtokogiSchema = z.object({
  eventDate: dateString('イベント日'),
  eventName: limitedString('イベント名', 100).min(1, { error: 'イベント名は必須項目です' }),
  payerId: idString('支払い担当'),
  amount: otokogiAmountSchema,
  place: limitedString('場所', 100).nullable().optional(),
  hasAlbum: z.boolean({ error: 'アルバム有無は true/false で指定してください' }).optional(),
  wasJanken: z.boolean({ error: 'じゃんけん有無は true/false で指定してください' }).optional(),
  memo: limitedString('メモ', 1000).nullable().optional(),
  eventId: idString('カレンダーイベント').nullable().optional(),
  participantIds: memberIdArray('参加メンバー').min(1, {
    error: '参加メンバーを1人以上選択してください',
  }),
})

export type CreateOtokogiInput = z.infer<typeof createOtokogiSchema>
