import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  MAX_PARTICIPANTS,
} from '@/lib/api-validation'

const WALICA_API = 'https://manage-expence-api-prod.herokuapp.com/api'

type WalicaDebtor = {
  debtor_id: number
  debtor_name: string
}

type WalicaPayment = {
  payment_id: number
  item_name: string
  price: number
  advance_payer_id: number
  advance_payer_name: string
  debtors: WalicaDebtor[]
  create_datetime: string
}

type WalicaPaybackTransaction = {
  sender_name: string
  receiver_name: string
  priceV2: number
}

// リクエストボディ検証スキーマ（walicaUrl は DB の VarChar(255) に対応）
const importSchema = z.object({
  walicaUrl: limitedString('walicaUrl', 255).min(1, { error: 'walicaUrl と memberMapping は必須です' }),
  memberMapping: z
    .array(
      z.object({
        walicaId: limitedString('walicaId', 50),
        walicaName: limitedString('walicaName', 100),
        appMemberId: idString('appMemberId'),
      }),
      { error: 'memberMapping の形式が正しくありません' }
    )
    .min(1, { error: 'walicaUrl と memberMapping は必須です' })
    .max(MAX_PARTICIPANTS, { error: `memberMapping は最大${MAX_PARTICIPANTS}件までです` }),
  warikanEventId: idString('warikanEventId').optional(), // 既存イベントに紐付ける場合
})

// POST /api/walica/import
// Walica URLからデータをインポートして割り勘イベントを作成/更新
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const validated = importSchema.safeParse(parsed.body)
    if (!validated.success) return validationErrorResponse(validated.error)

    const { walicaUrl, memberMapping, warikanEventId } = validated.data

    // URLからgroup_idを抽出
    const groupId = extractGroupId(walicaUrl)
    if (!groupId) {
      return NextResponse.json(
        { error: 'Walica URLの形式が正しくありません' },
        { status: 400 }
      )
    }

    // Walica APIからデータ取得
    const [groupRes, paymentsRes, paybackRes] = await Promise.all([
      fetch(`${WALICA_API}/group/${groupId}`),
      fetch(`${WALICA_API}/group/${groupId}/pay`),
      fetch(`${WALICA_API}/group/${groupId}/payback_transaction?shift_decimal_point=false`),
    ])

    if (!groupRes.ok) {
      return NextResponse.json(
        { error: 'Walicaグループが見つかりません' },
        { status: 404 }
      )
    }

    const groupData = await groupRes.json() as { group_name: string }
    const paymentsData = await paymentsRes.json() as { items: WalicaPayment[] }
    const paybackData = await paybackRes.json() as { payback_transaction: WalicaPaybackTransaction[] }

    // Walica名 → アプリメンバーIDのマッピングを構築
    const nameToMemberId = new Map<string, string>()
    for (const m of memberMapping) {
      nameToMemberId.set(m.walicaName, m.appMemberId)
      nameToMemberId.set(m.walicaId, m.appMemberId)
    }

    // 参加者IDリスト（重複排除）
    const participantIds = [...new Set(memberMapping.map((m) => m.appMemberId))]

    // トランザクションで一括作成
    const result = await prisma.$transaction(async (tx) => {
      let eventId: string

      if (warikanEventId) {
        // 既存イベントに紐付け — 既存の明細・精算を削除して上書き
        await tx.warikanExpense.deleteMany({ where: { warikanEventId } })
        await tx.warikanSettlement.deleteMany({ where: { warikanEventId } })
        await tx.warikanParticipant.deleteMany({ where: { warikanEventId } })

        await tx.warikanEvent.update({
          where: { id: warikanEventId },
          data: { walicaUrl },
        })

        // 参加者を再作成
        await tx.warikanParticipant.createMany({
          data: participantIds.map((memberId) => ({
            warikanEventId,
            memberId,
          })),
        })

        eventId = warikanEventId
      } else {
        // 新規割り勘イベント作成
        const newEvent = await tx.warikanEvent.create({
          data: {
            eventName: groupData.group_name,
            status: 'CLOSED',
            walicaUrl,
            participants: {
              create: participantIds.map((memberId) => ({ memberId })),
            },
          },
        })
        eventId = newEvent.id
      }

      // 立替明細をインポート（対象者情報付き）
      for (const payment of paymentsData.items) {
        const payerId = nameToMemberId.get(payment.advance_payer_name) ?? nameToMemberId.get(String(payment.advance_payer_id))
        if (!payerId) continue // マッチしないメンバーはスキップ

        // 対象者をマッピング（アプリのメンバーにマッチするもののみ）
        const debtorMemberIds = payment.debtors
          .map((d) => nameToMemberId.get(d.debtor_name) ?? nameToMemberId.get(String(d.debtor_id)))
          .filter((id): id is string => !!id)

        await tx.warikanExpense.create({
          data: {
            warikanEventId: eventId,
            payerId,
            description: payment.item_name,
            amount: Math.round(payment.price),
            ...(debtorMemberIds.length > 0 && {
              debtors: {
                create: [...new Set(debtorMemberIds)].map((memberId) => ({ memberId })),
              },
            }),
          },
        })
      }

      // 精算結果をインポート
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
          warikanEventId: eventId,
          fromMemberId: fromId,
          toMemberId: toId,
          amount: Math.round(tx_item.priceV2),
          isPaid: true,
          isReceived: true,
        })
      }

      if (settlements.length > 0) {
        await tx.warikanSettlement.createMany({ data: settlements })
      }

      // 作成したイベントを返す
      return tx.warikanEvent.findUnique({
        where: { id: eventId },
        include: {
          participants: { include: { member: true } },
          expenses: {
            include: {
              payer: true,
              debtors: { include: { member: true } },
            },
          },
          settlements: { include: { fromMember: true, toMember: true } },
        },
      })
    })

    return NextResponse.json({
      success: true,
      event: result,
      imported: {
        expenses: paymentsData.items.length,
        settlements: paybackData.payback_transaction.filter((t) => t.priceV2 !== 0).length,
      },
    }, { status: 201 })
  } catch (error) {
    return handleApiError(error, { logLabel: 'Walicaインポートエラー', fallbackMessage: 'Walicaデータのインポートに失敗しました' })
  }
}

function extractGroupId(url: string): string | null {
  const match = url.match(/walica\.jp\/(?:g|group)\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}
