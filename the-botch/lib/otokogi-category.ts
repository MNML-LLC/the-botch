// 男気イベントのカテゴリ推定ロジック
//
// OtokogiEvent は eventType を直接持たないため、以下の優先順位で分類する:
//   1. 関連カレンダー Event の eventType（最信頼）
//   2. eventName / place のキーワード一致
//   3. 金額閾値によるフォールバック
//
// 判定結果は Prisma の EventType と同じ 4 値:
//   TRIP / HANGOUT / ACTIVITY / OTHER

export const CATEGORIES = ['TRIP', 'HANGOUT', 'ACTIVITY', 'OTHER'] as const
export type OtokogiCategory = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<OtokogiCategory, string> = {
  TRIP: '旅行',
  HANGOUT: '飲み会',
  ACTIVITY: 'アクティビティ',
  OTHER: 'その他',
}

export const CATEGORY_COLORS: Record<OtokogiCategory, string> = {
  TRIP: '#0057b7',
  HANGOUT: '#d95c5c',
  ACTIVITY: '#d97706',
  OTHER: '#94a3b8',
}

const TRIP_KEYWORDS = ['旅行', '合宿', 'trip', 'ツアー', '温泉', '宿泊', '泊', '京都', '熱海', '箱根', '沖縄', '北海道']
const HANGOUT_KEYWORDS = ['飲み', '飲み会', '居酒屋', '焼肉', '寿司', 'バー', 'bar', '酒', '宅飲み', '歓送迎会', '新年会', '忘年会']
const ACTIVITY_KEYWORDS = ['釣り', 'キャンプ', 'bbq', 'バーベキュー', 'ゴルフ', 'スノボ', 'スキー', 'サウナ', 'テニス', 'フットサル', 'ボルダリング', 'カラオケ']

function matchKeywords(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase()
  return keywords.some((kw) => normalized.includes(kw.toLowerCase()))
}

export type ClassifyInput = {
  eventName: string
  place: string | null
  amount: number
  linkedEventType?: 'TRIP' | 'HANGOUT' | 'ACTIVITY' | 'OTHER' | null
}

/**
 * 単一の男気イベントをカテゴリに分類する。
 *
 * - linkedEventType（カレンダーイベント経由）があればそれを採用
 * - 名前・場所のキーワード一致を次に優先
 * - 最後に金額閾値で推定（≥10,000 円は旅行寄り、≥3,000 円は飲み会寄り）
 */
export function classifyOtokogiEvent(input: ClassifyInput): OtokogiCategory {
  if (input.linkedEventType) {
    return input.linkedEventType
  }

  const haystack = `${input.eventName} ${input.place ?? ''}`
  if (matchKeywords(haystack, TRIP_KEYWORDS)) return 'TRIP'
  if (matchKeywords(haystack, HANGOUT_KEYWORDS)) return 'HANGOUT'
  if (matchKeywords(haystack, ACTIVITY_KEYWORDS)) return 'ACTIVITY'

  if (input.amount >= 10_000) return 'TRIP'
  if (input.amount >= 3_000) return 'HANGOUT'
  return 'OTHER'
}
