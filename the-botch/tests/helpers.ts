// テスト用ヘルパー: Next.js API Route Handlerをテスト可能にする
import { NextRequest } from 'next/server'

const BASE_URL = 'http://localhost:3000'

/** NextRequest を生成する */
export function createRequest(
  path: string,
  options?: { method?: string; body?: unknown; searchParams?: Record<string, string> }
): NextRequest {
  const url = new URL(path, BASE_URL)
  if (options?.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value)
    }
  }
  return new NextRequest(url, {
    method: options?.method ?? 'GET',
    ...(options?.body
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body),
        }
      : {}),
  })
}

/** NextResponse からJSONを取得 */
export async function parseResponse<T = unknown>(res: Response): Promise<{ status: number; data: T }> {
  const data = (await res.json()) as T
  return { status: res.status, data }
}

/** params を Promise でラップ（Next.js App Router 形式） */
export function makeParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}
