/**
 * lib/otokogi-category.ts のテスト
 */
import { describe, test, expect } from 'vitest'
import { classifyOtokogiEvent } from '@/lib/otokogi-category'

describe('classifyOtokogiEvent', () => {
  test('linkedEventType があればそれを採用する', () => {
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

  test('キーワード無しかつ金額 ≥10,000 で TRIP フォールバック', () => {
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 15_000 })
    ).toBe('TRIP')
  })

  test('キーワード無しかつ 3,000 ≤ 金額 <10,000 で HANGOUT', () => {
    expect(
      classifyOtokogiEvent({ eventName: 'xxx', place: null, amount: 5_000 })
    ).toBe('HANGOUT')
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
