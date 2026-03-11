/**
 * Walica一括インポートスクリプト
 *
 * ExcelのWalica管理シートから取得した実URLを使い、
 * 既存の割り勘イベント49件にWalicaの立替明細・精算結果をインポートする。
 *
 * 実行: npx tsx scripts/migrate-walica.ts
 * ドライラン: npx tsx scripts/migrate-walica.ts --dry-run
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const WALICA_API = 'https://manage-expence-api-prod.herokuapp.com/api'
const DRY_RUN = process.argv.includes('--dry-run')

// ============================================================
// Walica URL マッピング（Excel「walica管理」シートから抽出）
// key = seed の warikan id, value = 実 Walica URL
// ============================================================
const URL_MAPPING: Record<number, string> = {
  1: 'https://walica.jp/group/01HSKKEKMVY25XK6FQZ7YP2QGJ',
  2: 'https://walica.jp/group/01HXKMBX0GW65812893NK0MZDN',
  3: 'https://walica.jp/group/01HZC862CDKMNFRTPQ36JWGSTC',
  4: 'https://walica.jp/group/01HZWC10GXRVZ32VD2QCK2KXQE',
  5: 'https://walica.jp/group/01HSK80TYTB28ZN5MF62CXS3NR',
  6: 'https://walica.jp/group/01HJ61BFJSNQDZMZMTF4PX421R',
  7: 'https://walica.jp/group/01J1Z7J7QAM8VFRAXRHXWJK5FS',
  8: 'https://walica.jp/group/01J280N9NR56P1F7W8ZWHGMQXH',
  9: 'https://walica.jp/group/01J36QDFTFREG1BRM5FTP8JRFY',
  10: 'https://walica.jp/group/01J3MTZFBM236EKGXA29T4QEDQ',
  11: 'https://walica.jp/group/01J4VQY0RT9J6TS2QMNH1PNQBJ',
  12: 'https://walica.jp/group/01J5FHYSC4J23G18F42ZR3FBY8',
  13: 'https://walica.jp/group/01J6456XQPE9TM93NTET67WRG9',
  14: 'https://walica.jp/group/01J66A4J3695VWEKG8X11Y4MV1',
  15: 'https://walica.jp/group/01J668B2Y7FSR175TH903BQXVN',
  16: 'https://walica.jp/group/01J73JBB592YXZZDVHNRZR8YCT',
  17: 'https://walica.jp/group/01J7B245KR97KQN8KVMCD4DBQR',
  18: 'https://walica.jp/group/01J9D24RTT33MYG8K9E28GRAF6',
  19: 'https://walica.jp/group/01JA4NYRBF0GSR10X9S4KSZYRK',
  20: 'https://walica.jp/group/01JB5TPYRSAES8JF36CSR38EX1',
  21: 'https://walica.jp/group/01JC7E0XBF71X3V6PN0PKGRXPF',
  22: 'https://walica.jp/group/01JFK9VH6N9TXXBXYFD29H91TV',
  23: 'https://walica.jp/group/01JGMXDSPT76Y86A5ET15R7D3F',
  24: 'https://walica.jp/group/01JHCCA2GDTV9PK5JF9EYFE2RM',
  25: 'https://walica.jp/group/01JHEYHK40REBEKR9JS3C3812D',
  26: 'https://walica.jp/group/01JJ47R0TC6Y7Z1BN5QVV42EDQ',
  27: 'https://walica.jp/group/01JKHQR22HZQ3HW73EK8591VXS',
  28: 'https://walica.jp/group/01JKXDWMC8RHKTR27G8MB6AQ97',
  29: 'https://walica.jp/group/01JMZPPTXR0PTHVF00EB2A5813',
  30: 'https://walica.jp/group/01JNX6H5RW8SNYEXABP10JHKW5',
  31: 'https://walica.jp/group/01JQGFMCN5BZR97NN1Q36GA4PM',
  32: 'https://walica.jp/group/01JRJTCNBKFQT062FM21W3RZ9V',
  33: 'https://walica.jp/group/01JQGFMCN5BZR97NN1Q36GA4PM', // #31と同一グループ
  34: 'https://walica.jp/group/01JV71FRNY1TGFWS84TZN1TCF9',
  35: 'https://walica.jp/group/01JX59GCNXN78GEV8BD42GZZ44',
  36: 'https://walica.jp/group/01JYT41K76NDBRJ2KM2Y2DCNK5',
  37: 'https://walica.jp/group/01K01QYM1DYQDCJX1FPPGABHFR',
  38: 'https://walica.jp/group/01K0EF8PQ5RSQJ4N5TFDVJ208E',
  39: 'https://walica.jp/group/01K0NHQ3CFWQT72XZS0G1QGP3C',
  40: 'https://walica.jp/group/01K4B2TYHMWNBM3TWVFXBE8NY3',
  41: 'https://walica.jp/group/01K5G34BY288GXK09NG4JVEH6F',
  42: 'https://walica.jp/group/01K6727SSA72VZ9WJB7YGFHXAN',
  43: 'https://walica.jp/group/01K79S034N0R10Q2HES4TZGWFH',
  44: 'https://walica.jp/group/01K84R2G45PTCVT5M3S10WGMTE',
  45: 'https://walica.jp/group/01K9MCPJPETPKK3BCZW0FJA2TC',
  46: 'https://walica.jp/group/01KDHK2BX7APKJW6FHS46SB0D1',
  47: 'https://walica.jp/group/01KE3XCGBHZT41TYD2QNXG0WR0',
  48: 'https://walica.jp/group/01KEJAYSBBS1G1ETSSB8R7X6GZ',
  49: 'https://walica.jp/group/01KGVMDQJ2HH5YH4NZ4H45H1R0',
}

// ============================================================
// メンバーID（seed.tsと同一）
// ============================================================
const MEMBER_IDS: Record<string, string> = {
  'ゆうき': '00000000-0000-4000-a000-000000000001',
  'ゆうへい': '00000000-0000-4000-a000-000000000002',
  'おかじ': '00000000-0000-4000-a000-000000000003',
  'もりや': '00000000-0000-4000-a000-000000000004',
  'けいすけ': '00000000-0000-4000-a000-000000000005',
  'たからい': '00000000-0000-4000-a000-000000000006',
}

// Walicaグループで使われるニックネーム → アプリメンバーIDの包括マッピング
const ALIAS_MAP: Record<string, string> = {
  // ゆうき（内山）
  'ゆうき': MEMBER_IDS['ゆうき'],
  'ゆき': MEMBER_IDS['ゆうき'],
  'ゆーき': MEMBER_IDS['ゆうき'],
  'うっちー': MEMBER_IDS['ゆうき'],
  'うちや': MEMBER_IDS['ゆうき'],
  '内山': MEMBER_IDS['ゆうき'],
  '勇気': MEMBER_IDS['ゆうき'],
  'YUKI': MEMBER_IDS['ゆうき'],
  // ゆうへい（大崎）
  'ゆうへい': MEMBER_IDS['ゆうへい'],
  'ゆへ': MEMBER_IDS['ゆうへい'],
  'ゆーへい': MEMBER_IDS['ゆうへい'],
  'ゆーへ': MEMBER_IDS['ゆうへい'],
  'おおさ': MEMBER_IDS['ゆうへい'],
  '大崎': MEMBER_IDS['ゆうへい'],
  '大﨑': MEMBER_IDS['ゆうへい'],
  '雄平': MEMBER_IDS['ゆうへい'],
  'YUHEI': MEMBER_IDS['ゆうへい'],
  // おかじ（岡嶋）
  'おかじ': MEMBER_IDS['おかじ'],
  'おか爺': MEMBER_IDS['おかじ'],
  '岡嶋': MEMBER_IDS['おかじ'],
  'OKJ': MEMBER_IDS['おかじ'],
  'okj': MEMBER_IDS['おかじ'],
  // もりや（森屋）
  'もりや': MEMBER_IDS['もりや'],
  'もりもり': MEMBER_IDS['もりや'],
  '森屋': MEMBER_IDS['もりや'],
  'MORIYA': MEMBER_IDS['もりや'],
  '正志': MEMBER_IDS['もりや'],
  'まさし': MEMBER_IDS['もりや'],
  'まさ': MEMBER_IDS['もりや'],
  // けいすけ（渡邊）
  'けいすけ': MEMBER_IDS['けいすけ'],
  'けーすけ': MEMBER_IDS['けいすけ'],
  'けーすけ？': MEMBER_IDS['けいすけ'],
  'わた': MEMBER_IDS['けいすけ'],
  'わたな': MEMBER_IDS['けいすけ'],
  '渡邊': MEMBER_IDS['けいすけ'],
  '景祐': MEMBER_IDS['けいすけ'],
  'けん': MEMBER_IDS['けいすけ'],
  'KEISUKE': MEMBER_IDS['けいすけ'],
  // たからい（宝井/寳井）
  'たからい': MEMBER_IDS['たからい'],
  '宝井': MEMBER_IDS['たからい'],
  '寳井': MEMBER_IDS['たからい'],
  '寳井選手': MEMBER_IDS['たからい'],
  'TK': MEMBER_IDS['たからい'],
  'タコライス': MEMBER_IDS['たからい'],
}

// ============================================================
// Walica API 型定義（スネークケース）
// ============================================================
type WalicaMember = {
  member_id: number
  member_name: string
}

type WalicaPayment = {
  payment_id: number
  item_name: string
  price: number
  advance_payer_id: number
  advance_payer_name: string
  debtors: { debtor_id: number; debtor_name: string }[]
}

type WalicaPaybackTransaction = {
  sender_name: string
  receiver_name: string
  priceV2: number
}

// ============================================================
// ユーティリティ
// ============================================================
function warikanUuid(id: number): string {
  return `20000000-0000-4000-a000-${String(id).padStart(12, '0')}`
}

function extractGroupId(url: string): string {
  const match = url.match(/walica\.jp\/(?:g|group)\/([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error(`URLからgroup_idを抽出できません: ${url}`)
  return match[1]
}

function toHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  )
}

function findMemberId(
  walicaName: string,
  appMembers: { id: string; name: string; fullName: string }[]
): string | null {
  const normalized = walicaName.toLowerCase().trim()

  // 完全一致
  for (const m of appMembers) {
    if (m.name === walicaName || m.fullName === walicaName) return m.id
    if (m.name.toLowerCase() === normalized || m.fullName.toLowerCase() === normalized) return m.id
  }

  // 部分一致
  for (const m of appMembers) {
    const mName = m.name.toLowerCase()
    const mFull = m.fullName.toLowerCase()
    if (normalized.includes(mName) || mName.includes(normalized)) return m.id
    if (normalized.includes(mFull) || mFull.includes(normalized)) return m.id
  }

  // ひらがな・カタカナ変換
  const normalizedHira = toHiragana(normalized)
  for (const m of appMembers) {
    const mHira = toHiragana(m.name.toLowerCase())
    if (normalizedHira === mHira || normalizedHira.includes(mHira) || mHira.includes(normalizedHira)) return m.id
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// メイン処理
// ============================================================
async function main(): Promise<void> {
  console.log(`Walica一括インポート ${DRY_RUN ? '(ドライラン)' : ''}`)
  console.log(`対象: ${Object.keys(URL_MAPPING).length}件`)
  console.log('')

  // アプリメンバー取得
  const appMembers = await prisma.member.findMany({
    select: { id: true, name: true, fullName: true },
  })
  console.log(`アプリメンバー: ${appMembers.map((m) => m.name).join(', ')}`)
  console.log('')

  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const [idStr, url] of Object.entries(URL_MAPPING)) {
    const id = Number(idStr)
    const warikanId = warikanUuid(id)
    const groupId = extractGroupId(url)

    process.stdout.write(`[${String(id).padStart(2, ' ')}/49] ${groupId.slice(0, 12)}... `)

    try {
      // Walica APIからデータ取得
      const [groupRes, paymentsRes, paybackRes] = await Promise.all([
        fetch(`${WALICA_API}/group/${groupId}`),
        fetch(`${WALICA_API}/group/${groupId}/pay`),
        fetch(`${WALICA_API}/group/${groupId}/payback_transaction?shift_decimal_point=false`),
      ])

      if (!groupRes.ok) {
        console.log(`❌ Walica API ${groupRes.status}`)
        errorCount++
        continue
      }

      const groupData = await groupRes.json() as { group_name: string; members: WalicaMember[] }
      const paymentsData = await paymentsRes.json() as { items: WalicaPayment[] }
      const paybackData = await paybackRes.json() as { payback_transaction: WalicaPaybackTransaction[] }

      // メンバーマッチング（エイリアスマップ優先、外部メンバーはスキップ）
      const nameToMemberId = new Map<string, string>()
      const externalNames: string[] = []

      for (const wm of groupData.members) {
        // 1. エイリアスマップで検索
        const aliasMatch = ALIAS_MAP[wm.member_name]
        if (aliasMatch) {
          nameToMemberId.set(wm.member_name, aliasMatch)
          nameToMemberId.set(String(wm.member_id), aliasMatch)
          continue
        }

        // 2. 通常のマッチング
        const memberId = findMemberId(wm.member_name, appMembers)
        if (memberId) {
          nameToMemberId.set(wm.member_name, memberId)
          nameToMemberId.set(String(wm.member_id), memberId)
        } else {
          // 外部メンバー: スキップするがグループ全体はスキップしない
          externalNames.push(wm.member_name)
        }
      }

      if (nameToMemberId.size === 0) {
        console.log(`⚠️  マッチするメンバーなし → スキップ`)
        skipCount++
        continue
      }

      const participantIds = [...new Set(nameToMemberId.values())]
      const externalNote = externalNames.length > 0 ? ` (外部: ${externalNames.join(', ')})` : ''

      // 立替明細
      const expenses: { warikanEventId: string; payerId: string; description: string; amount: number }[] = []
      for (const payment of paymentsData.items) {
        const payerId = nameToMemberId.get(payment.advance_payer_name) ?? nameToMemberId.get(String(payment.advance_payer_id))
        if (!payerId) continue

        expenses.push({
          warikanEventId: warikanId,
          payerId,
          description: payment.item_name,
          amount: Math.round(payment.price),
        })
      }

      // 精算結果
      const settlements: {
        warikanEventId: string
        fromMemberId: string
        toMemberId: string
        amount: number
        isPaid: boolean
        isReceived: boolean
      }[] = []

      for (const tx_item of paybackData.payback_transaction) {
        if (tx_item.priceV2 === 0) continue
        const fromId = nameToMemberId.get(tx_item.sender_name)
        const toId = nameToMemberId.get(tx_item.receiver_name)
        if (!fromId || !toId) continue

        settlements.push({
          warikanEventId: warikanId,
          fromMemberId: fromId,
          toMemberId: toId,
          amount: Math.round(tx_item.priceV2),
          isPaid: true,
          isReceived: true,
        })
      }

      const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0)
      console.log(`${groupData.group_name} → 明細${expenses.length}件, 精算${settlements.length}件, 合計¥${totalAmount.toLocaleString()}${externalNote}`)

      if (!DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          // 既存データ削除
          await tx.warikanExpense.deleteMany({ where: { warikanEventId: warikanId } })
          await tx.warikanSettlement.deleteMany({ where: { warikanEventId: warikanId } })
          await tx.warikanParticipant.deleteMany({ where: { warikanEventId: warikanId } })

          // walica_url 更新
          await tx.warikanEvent.update({
            where: { id: warikanId },
            data: { walicaUrl: url },
          })

          // 参加者再作成（Walicaグループのメンバーのみ）
          await tx.warikanParticipant.createMany({
            data: participantIds.map((memberId) => ({
              warikanEventId: warikanId,
              memberId,
            })),
          })

          // 立替明細
          if (expenses.length > 0) {
            await tx.warikanExpense.createMany({ data: expenses })
          }

          // 精算結果
          if (settlements.length > 0) {
            await tx.warikanSettlement.createMany({ data: settlements })
          }
        })
      }

      successCount++
    } catch (error) {
      console.log(`❌ エラー: ${error instanceof Error ? error.message : String(error)}`)
      errorCount++
    }

    // API負荷対策
    await sleep(300)
  }

  console.log('')
  console.log('=== 結果 ===')
  console.log(`成功: ${successCount}件`)
  console.log(`スキップ: ${skipCount}件`)
  console.log(`エラー: ${errorCount}件`)
}

main()
  .catch((e: Error) => {
    console.error('移行エラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
