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

// EventType 別スタイル (Tailwind のカラートークン、ダークモード対応)
// - solid: べた塗りドット / アイコン背景
// - chip: カレンダーセル内の細長いイベントバー
// - badge: 一覧の丸バッジ
export type EventTypeStyle = {
  solid: string
  chip: string
  badge: string
}

export const EVENT_TYPE_STYLES: Record<EventType, EventTypeStyle> = {
  TRIP: {
    solid: 'bg-blue-500 dark:bg-blue-400',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-500/25 dark:text-blue-100',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-100',
  },
  HANGOUT: {
    solid: 'bg-green-500 dark:bg-green-400',
    chip: 'bg-green-100 text-green-800 dark:bg-green-500/25 dark:text-green-100',
    badge: 'bg-green-100 text-green-700 dark:bg-green-500/25 dark:text-green-100',
  },
  ACTIVITY: {
    solid: 'bg-purple-500 dark:bg-purple-400',
    chip: 'bg-purple-100 text-purple-800 dark:bg-purple-500/25 dark:text-purple-100',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-500/25 dark:text-purple-100',
  },
  OTHER: {
    solid: 'bg-gray-500 dark:bg-gray-400',
    chip: 'bg-gray-100 text-gray-700 dark:bg-gray-500/25 dark:text-gray-100',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-500/25 dark:text-gray-100',
  },
}

export function eventTypeStyle(type: string): EventTypeStyle {
  if (type in EVENT_TYPE_STYLES) {
    return EVENT_TYPE_STYLES[type as EventType]
  }
  return EVENT_TYPE_STYLES.OTHER
}
