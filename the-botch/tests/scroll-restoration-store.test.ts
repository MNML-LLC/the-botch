/**
 * useScrollRestorationStore ユニットテスト — The botch
 *
 * pathname をキーにしたスクロール位置保存/取得の Zustand ストア検証。
 * 実行: npx vitest run tests/scroll-restoration-store.test.ts
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { useScrollRestorationStore } from '@/lib/scroll-restoration-store'

describe('useScrollRestorationStore', () => {
  beforeEach(() => {
    useScrollRestorationStore.setState({ positions: {} })
  })

  test('未保存のパスは undefined を返す', () => {
    expect(useScrollRestorationStore.getState().getPosition('/otokogi')).toBeUndefined()
  })

  test('保存した位置を取得できる', () => {
    useScrollRestorationStore.getState().savePosition('/otokogi', 512)
    expect(useScrollRestorationStore.getState().getPosition('/otokogi')).toBe(512)
  })

  test('パスごとに位置を独立して保持する', () => {
    useScrollRestorationStore.getState().savePosition('/otokogi', 200)
    useScrollRestorationStore.getState().savePosition('/warikan', 800)
    expect(useScrollRestorationStore.getState().getPosition('/otokogi')).toBe(200)
    expect(useScrollRestorationStore.getState().getPosition('/warikan')).toBe(800)
  })

  test('同じパスへの上書き保存で最新値になる', () => {
    useScrollRestorationStore.getState().savePosition('/warikan', 100)
    useScrollRestorationStore.getState().savePosition('/warikan', 400)
    expect(useScrollRestorationStore.getState().getPosition('/warikan')).toBe(400)
  })
})
