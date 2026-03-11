/**
 * displayDate バックフィルスクリプト
 *
 * 既存の全 WarikanEvent に displayDate を算出・設定する。
 * マイグレーション後に1回だけ実行する。
 *
 * 実行: npx tsx scripts/backfill-display-date.ts
 * ドライラン: npx tsx scripts/backfill-display-date.ts --dry-run
 */
import { PrismaClient } from '@prisma/client'

// parseEventDate: eventName の先頭8桁が YYYYMMDD パターンなら日付を返す
function parseEventDate(eventName: string): string | null {
  const match = eventName.match(/^(\d{4})(\d{2})(\d{2})/)
  if (match) {
    const [, y, m, d] = match
    return `${y}-${m}-${d}`
  }
  return null
}

// displayDate 算出ロジック（lib/date-utils.ts と同じ優先順）
function computeDisplayDate(
  eventName: string,
  paymentDeadline: Date | null,
  detailDeadline: Date | null,
): Date | null {
  const parsed = parseEventDate(eventName)
  if (parsed) return new Date(parsed)
  if (paymentDeadline) return paymentDeadline
  if (detailDeadline) return detailDeadline
  return null
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const prisma = new PrismaClient()

  try {
    const events = await prisma.warikanEvent.findMany({
      select: {
        id: true,
        eventName: true,
        detailDeadline: true,
        paymentDeadline: true,
        displayDate: true,
      },
    })

    console.log(`対象イベント数: ${events.length}`)

    let updated = 0
    let skipped = 0

    for (const event of events) {
      const newDisplayDate = computeDisplayDate(
        event.eventName,
        event.paymentDeadline,
        event.detailDeadline,
      )

      // 既に設定済みで同じ値ならスキップ
      const currentStr = event.displayDate?.toISOString().slice(0, 10) ?? null
      const newStr = newDisplayDate?.toISOString().slice(0, 10) ?? null
      if (currentStr === newStr) {
        skipped++
        continue
      }

      if (dryRun) {
        console.log(`[DRY RUN] ${event.eventName}: ${currentStr} → ${newStr}`)
      } else {
        await prisma.warikanEvent.update({
          where: { id: event.id },
          data: { displayDate: newDisplayDate },
        })
      }
      updated++
    }

    console.log(`完了: 更新=${updated}, スキップ=${skipped}${dryRun ? ' (ドライラン)' : ''}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('バックフィルエラー:', e)
  process.exit(1)
})
