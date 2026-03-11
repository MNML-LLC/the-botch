/**
 * 業務シナリオテスト — The botch
 *
 * ローカルDB（the_botch）を使用。テストデータは各テスト後にクリーンアップ。
 * 実行: npx vitest run tests/scenarios.test.ts
 */
import { describe, test, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createRequest, parseResponse, makeParams } from './helpers'

// --- API Route Handlers のインポート ---
import {
  GET as getMembersAll,
  POST as createMember,
} from '@/app/api/members/route'
import {
  GET as getMemberById,
  PUT as updateMember,
  DELETE as deleteMember,
} from '@/app/api/members/[id]/route'
import {
  GET as getOtokogiAll,
  POST as createOtokogi,
} from '@/app/api/otokogi/route'
import {
  GET as getOtokogiById,
  DELETE as deleteOtokogi,
} from '@/app/api/otokogi/[id]/route'
import { GET as getOtokogiStats } from '@/app/api/otokogi/stats/route'
import {
  GET as getWarikanAll,
  POST as createWarikan,
} from '@/app/api/warikan/route'
import {
  GET as getWarikanById,
  PUT as updateWarikan,
  DELETE as deleteWarikan,
} from '@/app/api/warikan/[id]/route'
import {
  GET as getExpenses,
  POST as createExpense,
} from '@/app/api/warikan/[id]/expenses/route'
import {
  PUT as updateExpense,
  DELETE as deleteExpense,
} from '@/app/api/warikan/[id]/expenses/[expenseId]/route'
import {
  GET as getSettlements,
  POST as calculateSettlements,
} from '@/app/api/warikan/[id]/settlements/route'
import { PATCH as patchSettlement } from '@/app/api/warikan/[id]/settlements/[settlementId]/route'
import {
  GET as getEvents,
  POST as createEvent,
} from '@/app/api/events/route'
import {
  GET as getEventById,
  PUT as updateEvent,
  DELETE as deleteEvent,
} from '@/app/api/events/[id]/route'
import { GET as getCalendar } from '@/app/api/calendar/route'

// --- テスト用データの管理 ---
// テスト用に作成したデータのIDを追跡（クリーンアップ用）
const createdIds = {
  members: [] as string[],
  otokogiEvents: [] as string[],
  warikanEvents: [] as string[],
  events: [] as string[],
}

// テスト用のメンバーIDを先に取得
let testMembers: { id: string; name: string }[] = []

// テスト開始前に既存メンバーを取得
async function getExistingMembers() {
  const res = await getMembersAll(createRequest('/api/members'))
  const { data } = await parseResponse<{ id: string; name: string }[]>(res)
  return data
}

// クリーンアップ: テストで作成したデータを削除
afterAll(async () => {
  // 逆順で削除（依存関係を考慮）
  for (const id of createdIds.events) {
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
  for (const id of createdIds.warikanEvents) {
    await prisma.warikanEvent.delete({ where: { id } }).catch(() => {})
  }
  for (const id of createdIds.otokogiEvents) {
    await prisma.otokogiEvent.delete({ where: { id } }).catch(() => {})
  }
  for (const id of createdIds.members) {
    await prisma.member.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

// ============================================================
// シナリオ1: 割り勘フロー（完全ライフサイクル）
// 新規作成→立替登録→対象者指定→精算計算→支払い→受領→自動クローズ
// ============================================================
describe('シナリオ1: 割り勘フロー（完全ライフサイクル）', () => {
  let warikanId: string
  let expenseId1: string
  let expenseId2: string
  let settlementIds: string[]

  test('既存メンバーを取得', async () => {
    testMembers = await getExistingMembers()
    expect(testMembers.length).toBeGreaterThanOrEqual(2)
  })

  test('割り勘イベントを新規作成', async () => {
    const participantIds = testMembers.slice(0, 4).map((m) => m.id)
    const res = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {
          eventName: 'テスト: テニス練習',
          participantIds,
          detailDeadline: '2026-03-15',
          paymentDeadline: '2026-03-20',
          memo: 'テスト用',
        },
      })
    )
    const { status, data } = await parseResponse<{ id: string; status: string; participants: unknown[] }>(res)
    expect(status).toBe(201)
    expect(data.status).toBe('ENTERING')
    expect(data.participants.length).toBe(4)
    warikanId = data.id
    createdIds.warikanEvents.push(warikanId)
  })

  test('立替明細を追加（全員対象）', async () => {
    const res = await createExpense(
      createRequest(`/api/warikan/${warikanId}/expenses`, {
        method: 'POST',
        body: {
          payerId: testMembers[0].id,
          description: 'コート代',
          amount: 8000,
        },
      }),
      makeParams({ id: warikanId })
    )
    const { status, data } = await parseResponse<{ id: string; debtors: unknown[] }>(res)
    expect(status).toBe(201)
    expect(data.debtors.length).toBe(4) // 全参加者
    expenseId1 = data.id
  })

  test('立替明細を追加（対象者指定: 2人のみ）', async () => {
    const debtorIds = [testMembers[0].id, testMembers[1].id]
    const res = await createExpense(
      createRequest(`/api/warikan/${warikanId}/expenses`, {
        method: 'POST',
        body: {
          payerId: testMembers[1].id,
          description: 'ボール代',
          amount: 2000,
          debtorIds,
        },
      }),
      makeParams({ id: warikanId })
    )
    const { status, data } = await parseResponse<{ id: string; debtors: unknown[] }>(res)
    expect(status).toBe(201)
    expect(data.debtors.length).toBe(2) // 指定した2人のみ
    expenseId2 = data.id
  })

  test('立替明細一覧を取得', async () => {
    const res = await getExpenses(
      createRequest(`/api/warikan/${warikanId}/expenses`),
      makeParams({ id: warikanId })
    )
    const { status, data } = await parseResponse<unknown[]>(res)
    expect(status).toBe(200)
    expect(data.length).toBe(2)
  })

  test('割り勘詳細を取得（対象者情報含む）', async () => {
    const res = await getWarikanById(
      createRequest(`/api/warikan/${warikanId}`),
      makeParams({ id: warikanId })
    )
    const { status, data } = await parseResponse<{
      expenses: { debtors: { memberId: string }[] }[]
    }>(res)
    expect(status).toBe(200)
    // 各明細に対象者が含まれている
    const expense1 = data.expenses.find((e: { debtors: { memberId: string }[] }) => e.debtors.length === 4)
    const expense2 = data.expenses.find((e: { debtors: { memberId: string }[] }) => e.debtors.length === 2)
    expect(expense1).toBeDefined()
    expect(expense2).toBeDefined()
  })

  test('精算を計算', async () => {
    const res = await calculateSettlements(
      createRequest(`/api/warikan/${warikanId}/settlements`, { method: 'POST' }),
      makeParams({ id: warikanId })
    )
    const { status, data } = await parseResponse<{
      status: string
      settlements: { id: string; fromMemberId: string; toMemberId: string; amount: number }[]
      summary: { totalAmount: number }
    }>(res)
    expect(status).toBe(200)
    expect(data.status).toBe('PAYING')
    expect(data.settlements.length).toBeGreaterThan(0)
    expect(data.summary.totalAmount).toBe(10000) // 8000 + 2000
    settlementIds = data.settlements.map((s: { id: string }) => s.id)

    // 精算金額の合計が合理的であることを確認
    // コート代8000円（4人割り=1人2000円）+ ボール代2000円（2人割り=1人1000円）
    // member[0]: 支払8000, 負担=2000+1000=3000 → +5000（受取側）
    // member[1]: 支払2000, 負担=2000+1000=3000 → -1000（支払側）
    // member[2]: 支払0, 負担=2000 → -2000（支払側）
    // member[3]: 支払0, 負担=2000 → -2000（支払側）
    const totalSettlement = data.settlements.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0)
    expect(totalSettlement).toBe(5000) // 1000+2000+2000
  })

  test('送金済みにする', async () => {
    for (const sid of settlementIds) {
      const res = await patchSettlement(
        createRequest(`/api/warikan/${warikanId}/settlements/${sid}`, {
          method: 'PATCH',
          body: { action: 'pay' },
        }),
        makeParams({ id: warikanId, settlementId: sid })
      )
      const { status, data } = await parseResponse<{ settlement: { isPaid: boolean } }>(res)
      expect(status).toBe(200)
      expect(data.settlement.isPaid).toBe(true)
    }
  })

  test('受領確認で自動クローズ', async () => {
    for (let i = 0; i < settlementIds.length; i++) {
      const sid = settlementIds[i]
      const res = await patchSettlement(
        createRequest(`/api/warikan/${warikanId}/settlements/${sid}`, {
          method: 'PATCH',
          body: { action: 'receive' },
        }),
        makeParams({ id: warikanId, settlementId: sid })
      )
      const { status, data } = await parseResponse<{ eventClosed: boolean }>(res)
      expect(status).toBe(200)

      if (i === settlementIds.length - 1) {
        // 最後の受領で自動クローズ
        expect(data.eventClosed).toBe(true)
      }
    }

    // ステータスがCLOSEDになっていることを確認
    const res = await getWarikanById(
      createRequest(`/api/warikan/${warikanId}`),
      makeParams({ id: warikanId })
    )
    const { data } = await parseResponse<{ status: string }>(res)
    expect(data.status).toBe('CLOSED')
  })

  test('クローズ済みイベントには明細追加不可', async () => {
    const res = await createExpense(
      createRequest(`/api/warikan/${warikanId}/expenses`, {
        method: 'POST',
        body: {
          payerId: testMembers[0].id,
          description: 'これは追加できない',
          amount: 1000,
        },
      }),
      makeParams({ id: warikanId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('クローズ済みイベントは再精算不可', async () => {
    const res = await calculateSettlements(
      createRequest(`/api/warikan/${warikanId}/settlements`, { method: 'POST' }),
      makeParams({ id: warikanId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })
})

// ============================================================
// シナリオ2: 漢気フロー
// 新規登録→一覧確認→統計反映
// ============================================================
describe('シナリオ2: 漢気フロー', () => {
  let otokogiId: string

  test('漢気イベントを新規登録', async () => {
    const participantIds = testMembers.slice(0, 3).map((m) => m.id)
    const res = await createOtokogi(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: {
          eventDate: '2026-03-08',
          eventName: 'テスト: 焼肉',
          payerId: testMembers[0].id,
          amount: 30000,
          place: '恵比寿',
          hasAlbum: true,
          memo: 'テスト用',
          participantIds,
        },
      })
    )
    const { status, data } = await parseResponse<{
      id: string
      amount: number
      payer: { id: string }
      participants: unknown[]
    }>(res)
    expect(status).toBe(201)
    expect(data.amount).toBe(30000)
    expect(data.payer.id).toBe(testMembers[0].id)
    expect(data.participants.length).toBe(3)
    otokogiId = data.id
    createdIds.otokogiEvents.push(otokogiId)
  })

  test('一覧に表示される', async () => {
    const res = await getOtokogiAll(createRequest('/api/otokogi'))
    const { status, data } = await parseResponse<{ data: { id: string }[]; nextCursor: string | null }>(res)
    expect(status).toBe(200)
    expect(data.data.some((e) => e.id === otokogiId)).toBe(true)
  })

  test('詳細を取得', async () => {
    const res = await getOtokogiById(
      createRequest(`/api/otokogi/${otokogiId}`),
      makeParams({ id: otokogiId })
    )
    const { status, data } = await parseResponse<{ eventName: string; amount: number }>(res)
    expect(status).toBe(200)
    expect(data.eventName).toBe('テスト: 焼肉')
    expect(data.amount).toBe(30000)
  })

  test('統計APIにテストデータが反映', async () => {
    const res = await getOtokogiStats(createRequest('/api/otokogi/stats'))
    const { status, data } = await parseResponse<{
      totalCount: number
      totalAmount: number
      perMember: { id: string }[]
    }>(res)
    expect(status).toBe(200)
    expect(data.totalCount).toBeGreaterThan(0)
    expect(data.totalAmount).toBeGreaterThan(0)
    // メンバー別統計がある
    expect(data.perMember.length).toBeGreaterThan(0)
  })

  test('統計APIに年度フィルター適用', async () => {
    const res = await getOtokogiStats(
      createRequest('/api/otokogi/stats', { searchParams: { year: '2026' } })
    )
    const { status, data } = await parseResponse<{ totalCount: number }>(res)
    expect(status).toBe(200)
    // 2026年のデータが含まれる
    expect(data.totalCount).toBeGreaterThan(0)
  })

  test('存在しない年度ではイベント0件', async () => {
    const res = await getOtokogiStats(
      createRequest('/api/otokogi/stats', { searchParams: { year: '2000' } })
    )
    const { status, data } = await parseResponse<{ totalCount: number }>(res)
    expect(status).toBe(200)
    expect(data.totalCount).toBe(0)
  })
})

// ============================================================
// シナリオ3: Walicaインポート（プレビュー）
// ============================================================
describe('シナリオ3: Walicaインポート（プレビュー）', () => {
  // 実際のWalica URLを使ってプレビューをテスト（GETメソッド + query param）
  // 注: import はDBに書き込むので、プレビューのみテスト
  test('有効なWalica URLでプレビュー取得', async () => {
    const { GET: previewWalica } = await import('@/app/api/walica/preview/route')
    const warikan = await prisma.warikanEvent.findFirst({
      where: { walicaUrl: { not: null, contains: 'walica.jp' } },
    })
    if (!warikan?.walicaUrl) {
      console.log('Walica URL付きの割り勘イベントがないためスキップ')
      return
    }

    const res = await previewWalica(
      createRequest('/api/walica/preview', {
        searchParams: { url: warikan.walicaUrl },
      })
    )
    const { status, data } = await parseResponse<{
      groupName: string
      members: unknown[]
      expenses: unknown[]
    }>(res)

    // Walica APIが応答する場合のみ検証（外部APIなので落ちている可能性あり）
    if (status === 200) {
      expect(data.groupName).toBeTruthy()
      expect(data.members.length).toBeGreaterThan(0)
    } else {
      console.log(`Walica API応答なし (status: ${status})`)
    }
  })

  test('無効なWalica URLでエラー', async () => {
    const { GET: previewWalica } = await import('@/app/api/walica/preview/route')
    const res = await previewWalica(
      createRequest('/api/walica/preview', {
        searchParams: { url: 'https://example.com/invalid' },
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })
})

// ============================================================
// シナリオ4: カレンダーイベント登録→紐付け
// ============================================================
describe('シナリオ4: カレンダー・イベント', () => {
  let eventId: string

  test('カレンダーイベントを作成', async () => {
    const participantIds = testMembers.slice(0, 4).map((m) => m.id)
    const res = await createEvent(
      createRequest('/api/events', {
        method: 'POST',
        body: {
          title: 'テスト: 山中湖旅行',
          date: '2026-04-01',
          endDate: '2026-04-03',
          description: '2泊3日のテニス合宿',
          eventType: 'TRIP',
          createdById: testMembers[0].id,
          participantIds,
        },
      })
    )
    const { status, data } = await parseResponse<{
      id: string
      title: string
      participants: unknown[]
    }>(res)
    expect(status).toBe(201)
    expect(data.title).toBe('テスト: 山中湖旅行')
    expect(data.participants.length).toBe(4)
    eventId = data.id
    createdIds.events.push(eventId)
  })

  test('イベント詳細を取得', async () => {
    const res = await getEventById(
      createRequest(`/api/events/${eventId}`),
      makeParams({ id: eventId })
    )
    const { status, data } = await parseResponse<{ title: string; eventType: string }>(res)
    expect(status).toBe(200)
    expect(data.title).toBe('テスト: 山中湖旅行')
    expect(data.eventType).toBe('TRIP')
  })

  test('割り勘をイベントに紐付け', async () => {
    // 新しい割り勘を作成してイベントに紐付け
    const createRes = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {
          eventName: 'テスト: 山中湖割り勘',
          participantIds: testMembers.slice(0, 4).map((m) => m.id),
        },
      })
    )
    const { data: warikan } = await parseResponse<{ id: string }>(createRes)
    createdIds.warikanEvents.push(warikan.id)

    // eventIdを紐付け
    const updateRes = await updateWarikan(
      createRequest(`/api/warikan/${warikan.id}`, {
        method: 'PUT',
        body: { eventId },
      }),
      makeParams({ id: warikan.id })
    )
    const { status } = await parseResponse(updateRes)
    expect(status).toBe(200)

    // イベント詳細から紐付けを確認
    const eventRes = await getEventById(
      createRequest(`/api/events/${eventId}`),
      makeParams({ id: eventId })
    )
    const { data: eventData } = await parseResponse<{
      warikanEvents: { id: string }[]
    }>(eventRes)
    expect(eventData.warikanEvents.some((w: { id: string }) => w.id === warikan.id)).toBe(true)
  })

  test('カレンダーAPIで月別データ取得', async () => {
    const res = await getCalendar(
      createRequest('/api/calendar', { searchParams: { year: '2026', month: '4' } })
    )
    const { status, data } = await parseResponse<{
      events: unknown[]
    }>(res)
    expect(status).toBe(200)
    // 4月のイベントが含まれる
    expect(data.events).toBeDefined()
  })

  test('イベント更新', async () => {
    const res = await updateEvent(
      createRequest(`/api/events/${eventId}`, {
        method: 'PUT',
        body: { title: 'テスト: 山中湖旅行（更新）', description: '更新されたメモ' },
      }),
      makeParams({ id: eventId })
    )
    const { status, data } = await parseResponse<{ title: string }>(res)
    expect(status).toBe(200)
    expect(data.title).toBe('テスト: 山中湖旅行（更新）')
  })
})

// ============================================================
// シナリオ5: メンバーCRUD
// ============================================================
describe('シナリオ5: メンバーCRUD', () => {
  let newMemberId: string

  test('メンバーを作成', async () => {
    const res = await createMember(
      createRequest('/api/members', {
        method: 'POST',
        body: {
          name: 'テスト太郎',
          fullName: 'テスト',
          initial: 'T',
          colorBg: 'bg-green-100',
          colorText: 'text-green-700',
          paypayId: '@test_taro',
        },
      })
    )
    const { status, data } = await parseResponse<{ id: string; name: string }>(res)
    expect(status).toBe(201)
    expect(data.name).toBe('テスト太郎')
    newMemberId = data.id
    createdIds.members.push(newMemberId)
  })

  test('メンバー一覧に含まれる', async () => {
    const res = await getMembersAll(createRequest('/api/members'))
    const { status, data } = await parseResponse<{ id: string }[]>(res)
    expect(status).toBe(200)
    expect(data.some((m) => m.id === newMemberId)).toBe(true)
  })

  test('メンバー詳細を取得', async () => {
    const res = await getMemberById(
      createRequest(`/api/members/${newMemberId}`),
      makeParams({ id: newMemberId })
    )
    const { status, data } = await parseResponse<{ name: string; paypayId: string }>(res)
    expect(status).toBe(200)
    expect(data.name).toBe('テスト太郎')
    expect(data.paypayId).toBe('@test_taro')
  })

  test('メンバーを更新', async () => {
    const res = await updateMember(
      createRequest(`/api/members/${newMemberId}`, {
        method: 'PUT',
        body: { name: 'テスト太郎（更新）', paypayId: '@test_updated' },
      }),
      makeParams({ id: newMemberId })
    )
    const { status, data } = await parseResponse<{ name: string; paypayId: string }>(res)
    expect(status).toBe(200)
    expect(data.name).toBe('テスト太郎（更新）')
    expect(data.paypayId).toBe('@test_updated')
  })

  test('メンバー名の重複はエラー', async () => {
    // 既存メンバーと同名で作成を試みる
    const res = await createMember(
      createRequest('/api/members', {
        method: 'POST',
        body: {
          name: testMembers[0].name, // 既存メンバーの名前
          fullName: '重複',
          initial: 'D',
        },
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(409)
  })

  test('メンバーを削除（非活性化）', async () => {
    const res = await deleteMember(
      createRequest(`/api/members/${newMemberId}`, { method: 'DELETE' }),
      makeParams({ id: newMemberId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
  })
})

// ============================================================
// シナリオ6: 年度フィルター
// ============================================================
describe('シナリオ6: 年度フィルター', () => {
  test('漢気一覧に年度フィルター適用', async () => {
    const res = await getOtokogiAll(
      createRequest('/api/otokogi', { searchParams: { year: '2026' } })
    )
    const { status, data } = await parseResponse<{ data: { eventDate: string }[]; nextCursor: string | null }>(res)
    expect(status).toBe(200)
    // 全てのイベントが2026年
    for (const event of data.data) {
      const year = new Date(event.eventDate).getFullYear()
      expect(year).toBe(2026)
    }
  })

  test('割り勘一覧にステータスフィルター適用', async () => {
    const res = await getWarikanAll(
      createRequest('/api/warikan', { searchParams: { status: 'CLOSED' } })
    )
    const { status, data } = await parseResponse<{ data: { status: string }[]; nextCursor: string | null }>(res)
    expect(status).toBe(200)
    for (const event of data.data) {
      expect(event.status).toBe('CLOSED')
    }
  })

  test('割り勘一覧に年度フィルター適用', async () => {
    const res = await getWarikanAll(
      createRequest('/api/warikan', { searchParams: { year: '2026' } })
    )
    const { status, data } = await parseResponse<{ data: { createdAt: string }[]; nextCursor: string | null }>(res)
    expect(status).toBe(200)
    for (const event of data.data) {
      const year = new Date(event.createdAt).getFullYear()
      expect(year).toBe(2026)
    }
  })

  test('存在しない年度では0件', async () => {
    const res = await getOtokogiAll(
      createRequest('/api/otokogi', { searchParams: { year: '2000' } })
    )
    const { status, data } = await parseResponse<{ data: unknown[]; nextCursor: string | null }>(res)
    expect(status).toBe(200)
    expect(data.data.length).toBe(0)
  })

  test('統計APIに年度フィルター適用', async () => {
    const resAll = await getOtokogiStats(createRequest('/api/otokogi/stats'))
    const res2026 = await getOtokogiStats(
      createRequest('/api/otokogi/stats', { searchParams: { year: '2026' } })
    )
    const { data: dataAll } = await parseResponse<{ totalCount: number }>(resAll)
    const { data: data2026 } = await parseResponse<{ totalCount: number }>(res2026)

    // 全期間のイベント数 ≥ 2026年のイベント数
    expect(dataAll.totalCount).toBeGreaterThanOrEqual(data2026.totalCount)
  })
})

// ============================================================
// シナリオ7: API全エンドポイント異常系
// ============================================================
describe('シナリオ7: API異常系テスト', () => {
  // --- Members ---
  test('POST /api/members — 必須項目なし', async () => {
    const res = await createMember(
      createRequest('/api/members', {
        method: 'POST',
        body: { name: 'テスト' }, // fullName, initial が不足
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('GET /api/members/[id] — 存在しないID', async () => {
    const res = await getMemberById(
      createRequest('/api/members/nonexistent-id'),
      makeParams({ id: 'nonexistent-id' })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(404)
  })

  // --- Otokogi ---
  test('POST /api/otokogi — 必須項目なし', async () => {
    const res = await createOtokogi(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { eventName: 'テスト' }, // eventDate, payerId, amount が不足
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('POST /api/otokogi — 参加者なし', async () => {
    const res = await createOtokogi(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: {
          eventDate: '2026-03-08',
          eventName: 'テスト',
          payerId: testMembers[0].id,
          amount: 1000,
          participantIds: [],
        },
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('GET /api/otokogi/[id] — 存在しないID', async () => {
    const res = await getOtokogiById(
      createRequest('/api/otokogi/nonexistent-id'),
      makeParams({ id: 'nonexistent-id' })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(404)
  })

  // --- Warikan ---
  test('POST /api/warikan — 必須項目なし', async () => {
    const res = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {}, // eventName, participantIds が不足
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('POST /api/warikan — 参加者なし', async () => {
    const res = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: { eventName: 'テスト', participantIds: [] },
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('GET /api/warikan/[id] — 存在しないID', async () => {
    const res = await getWarikanById(
      createRequest('/api/warikan/nonexistent-id'),
      makeParams({ id: 'nonexistent-id' })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(404)
  })

  // --- Expenses ---
  test('POST /api/warikan/[id]/expenses — 金額0', async () => {
    // テスト用のENTERINGステータスの割り勘を使う
    const warikan = await prisma.warikanEvent.findFirst({
      where: { status: 'ENTERING' },
    })
    if (!warikan) return

    const res = await createExpense(
      createRequest(`/api/warikan/${warikan.id}/expenses`, {
        method: 'POST',
        body: { payerId: testMembers[0].id, description: 'テスト', amount: 0 },
      }),
      makeParams({ id: warikan.id })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('POST /api/warikan/[id]/expenses — 負の金額', async () => {
    const warikan = await prisma.warikanEvent.findFirst({
      where: { status: 'ENTERING' },
    })
    if (!warikan) return

    const res = await createExpense(
      createRequest(`/api/warikan/${warikan.id}/expenses`, {
        method: 'POST',
        body: { payerId: testMembers[0].id, description: 'テスト', amount: -100 },
      }),
      makeParams({ id: warikan.id })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('POST /api/warikan/[id]/expenses — 存在しないイベント', async () => {
    const res = await createExpense(
      createRequest('/api/warikan/nonexistent/expenses', {
        method: 'POST',
        body: { payerId: testMembers[0].id, description: 'テスト', amount: 1000 },
      }),
      makeParams({ id: 'nonexistent' })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(404)
  })

  // --- Settlements ---
  test('POST /api/warikan/[id]/settlements — 明細なしで精算', async () => {
    // 明細なしの割り勘を作成
    const createRes = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {
          eventName: 'テスト: 空割り勘',
          participantIds: testMembers.slice(0, 2).map((m) => m.id),
        },
      })
    )
    const { data: warikan } = await parseResponse<{ id: string }>(createRes)
    createdIds.warikanEvents.push(warikan.id)

    const res = await calculateSettlements(
      createRequest(`/api/warikan/${warikan.id}/settlements`, { method: 'POST' }),
      makeParams({ id: warikan.id })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400) // 明細がないのでエラー
  })

  test('PATCH /api/warikan/[id]/settlements/[sid] — 不正なaction', async () => {
    // 既存の精算レコードを使う
    const settlement = await prisma.warikanSettlement.findFirst()
    if (!settlement) return

    const res = await patchSettlement(
      createRequest(`/api/warikan/${settlement.warikanEventId}/settlements/${settlement.id}`, {
        method: 'PATCH',
        body: { action: 'invalid' },
      }),
      makeParams({ id: settlement.warikanEventId, settlementId: settlement.id })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  // --- Events ---
  test('POST /api/events — 必須項目なし', async () => {
    const res = await createEvent(
      createRequest('/api/events', {
        method: 'POST',
        body: { title: 'テスト' }, // date, createdById が不足
      })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
  })

  test('GET /api/events/[id] — 存在しないID', async () => {
    const res = await getEventById(
      createRequest('/api/events/nonexistent-id'),
      makeParams({ id: 'nonexistent-id' })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(404)
  })

  test('DELETE /api/events/[id] — 存在しないID', async () => {
    const res = await deleteEvent(
      createRequest('/api/events/nonexistent-id', { method: 'DELETE' }),
      makeParams({ id: 'nonexistent-id' })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(404)
  })
})
