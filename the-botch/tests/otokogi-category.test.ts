/**
 * lib/otokogi-category.ts のテスト
 *
 * 分類ロジックの優先順位 (Issue #410):
 *   1. explicitEventType (OtokogiEvent 自身のカラム、最優先)
 *   2. linkedEventType (親カレンダー Event)
 *   3. eventName / place のキーワード一致
 *   4. 金額閾値 (TRIP ¥50,000+ / HANGOUT ¥20,000+)
 *   5. OTHER
 */
import { describe, test, expect } from 'vitest'
import { classifyOtokogiEvent } from '@/lib/otokogi-category'

describe('classifyOtokogiEvent', () => {
  test('explicitEventType が最優先で採用される (キーワード・金額を無視)', () => {
    expect(
      classifyOtokogiEvent({
        eventName: '箱根旅行',
        place: '温泉旅館',
        amount: 100_000,
        explicitEventType: 'OTHER',
        linkedEventType: 'TRIP',
      })
    ).toBe('OTHER')
  })

  test('explicitEventType=HANGOUT は HANGOUT として確定', () => {
    expect(
      classifyOtokogiEvent({
        eventName: 'xxx',
        place: null,
        amount: 15_000,
        explicitEventType: 'HANGOUT',
      })
    ).toBe('HANGOUT')
  })

  test('explicitEventType が null なら linkedEventType にフォールバック', () => {
    expect(
      classifyOtokogiEvent({
        eventName: '飲み会',
        place: null,
        amount: 5000,
        explicitEventType: null,
        linkedEventType: 'TRIP',
      })
    ).toBe('TRIP')
  })

  test('linkedEventType があればそれを採用する (explicit なし)', () => {
    expect(
      classifyOtokogiEvent({
        eventName: '飲み会',
        place: null,
        amount: 5000,
        linkedEventType: 'TRIP',
      })
    ).toBe('TRIP')
  })

  test('旅行キーワード一致で TRIP', () => {
    expect(
      classifyOtokogiEvent({ eventName: '箱根旅行', place: null, amount: 500 })
    ).toBe('TRIP')
    expect(
      classifyOtokogiEvent({ eventName: '合宿打ち上げ', place: null, amount: 500 })
    ).toBe('TRIP')
  })

  test('飲み会キーワード一致で HANGOUT', () => {
    expect(
      classifyOtokogiEvent({ eventName: '新年会', place: null, amount: 500 })
    ).toBe('HANGOUT')
    expect(
      classifyOtokogiEvent({ eventName: '2次会', place: '居酒屋', amount: 500 })
    ).toBe('HANGOUT')
  })

  test('アクティビティキーワード一致で ACTIVITY', () => {
    expect(
      classifyOtokogiEvent({ eventName: 'ゴルフコンペ', place: null, amount: 500 })
    ).toBe('ACTIVITY')
    expect(
      classifyOtokogiEvent({ eventName: 'サウナ', place: null, amount: 500 })
    ).toBe('ACTIVITY')
  })

  test('キーワード無しかつ金額 ≥¥50,000 で TRIP フォールバック', () => {
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 60_000 })
    ).toBe('TRIP')
  })

  test('キーワード無しかつ ¥20,000 ≤ 金額 <¥50,000 で HANGOUT', () => {
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 25_000 })
    ).toBe('HANGOUT')
  })

  test('キーワード無しかつ金額 <¥20,000 で OTHER (男気最低額 ¥10,000 を含む)', () => {
    // Issue #410: 旧ロジックでは ¥10,000 → TRIP になっていたが修正
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 15_000 })
    ).toBe('OTHER')
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 10_000 })
    ).toBe('OTHER')
  })

  test('小額かつキーワード無しで OTHER', () => {
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 500 })
    ).toBe('OTHER')
  })

  test('place のキーワードも拾う', () => {
    expect(
      classifyOtokogiEvent({ eventName: '集まり', place: '焼肉店', amount: 500 })
    ).toBe('HANGOUT')
  })

  test('linkedEventType=OTHER は OTHER として扱う（キーワード無視）', () => {
    expect(
      classifyOtokogiEvent({
        eventName: '箱根旅行',
        place: null,
        amount: 20_000,
        linkedEventType: 'OTHER',
      })
    ).toBe('OTHER')
  })
})
