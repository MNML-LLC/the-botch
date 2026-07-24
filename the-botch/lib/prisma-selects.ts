import type { Prisma } from '@/lib/generated/prisma/client'

// メンバー表示用の共通フィールド（アバター・名前表示に必要な最小セット）
export const MEMBER_SELECT = {
  id: true,
  name: true,
  initial: true,
  colorBg: true,
  colorText: true,
} as const satisfies Prisma.MemberSelect

// フルネーム付き（割り勘参加者表示用）
export const MEMBER_SELECT_FULL = {
  ...MEMBER_SELECT,
  fullName: true,
} as const satisfies Prisma.MemberSelect

// PayPay ID 付き（精算の支払元表示用）
export const MEMBER_SELECT_WITH_PAYPAY = {
  ...MEMBER_SELECT,
  paypayId: true,
} as const satisfies Prisma.MemberSelect

// PayPay ID + 銀行口座付き（精算の受取先表示用）
export const MEMBER_SELECT_WITH_BANK = {
  ...MEMBER_SELECT,
  paypayId: true,
  bankAccount: true,
} as const satisfies Prisma.MemberSelect
