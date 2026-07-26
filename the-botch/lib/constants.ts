import type { EventType, WarikanStatus } from '@/lib/generated/prisma/client'

// 割り勘イベントのステータス日本語ラベル
export const WARIKAN_STATUS_LABELS: Record<WarikanStatus, string> = {
  ENTERING: '明細入力中',
  PAYING: '支払待ち',
  CLOSED: 'クローズ',
}

// カレンダーイベントの種別日本語ラベル
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  TRIP: '旅行',
  HANGOUT: '飲み会',
  ACTIVITY: 'アクティビティ',
  OTHER: 'その他',
}
