// メンバー API のリクエストボディ検証スキーマ
//
// 文字列長は DB カラム定義に対応（initial は Char(1)）。
import { z } from 'zod'
import { limitedString } from '@/lib/api-validation'

/** POST /api/members — メンバー作成のボディ */
export const createMemberSchema = z.object({
  name: limitedString('ニックネーム', 100).min(1, { error: 'ニックネームは必須項目です' }),
  fullName: limitedString('フルネーム', 100).min(1, { error: 'フルネームは必須項目です' }),
  initial: limitedString('イニシャル', 1).min(1, { error: 'イニシャルは必須項目です' }),
  colorBg: limitedString('背景色', 50).optional(),
  colorText: limitedString('文字色', 50).optional(),
  paypayId: limitedString('PayPay ID', 100).nullable().optional(),
})

export type CreateMemberInput = z.infer<typeof createMemberSchema>
