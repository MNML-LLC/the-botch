// メンバー API のリクエストボディ検証スキーマ
//
// 文字列長は DB カラム定義に対応（initial は Char(1)）。
import { z } from 'zod'
import { limitedString } from '@/lib/api-validation'

/** POST /api/members — メンバー作成のボディ */
export const createMemberSchema = z.object({
  name: limitedString('name', 100).min(1, { error: 'name は必須です' }),
  fullName: limitedString('fullName', 100).min(1, { error: 'fullName は必須です' }),
  initial: limitedString('initial', 1).min(1, { error: 'initial は必須です' }),
  colorBg: limitedString('colorBg', 50).optional(),
  colorText: limitedString('colorText', 50).optional(),
  paypayId: limitedString('paypayId', 100).nullable().optional(),
})

export type CreateMemberInput = z.infer<typeof createMemberSchema>
