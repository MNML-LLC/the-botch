// 全ページ Basic Auth 保護用 Next.js middleware (Issue #329)
//
// the-botch は MNML 内部メンバー向けの精算ツールで、口座情報・個人金額を保持する。
// 従来は Vercel の URL を知っていれば誰でもアクセスできる "security by obscurity"
// 状態だったため、全ページで Basic Auth を要求するよう保護する。
//
// 認証バイパス:
// - /api/line/*  — LIFF ID Token / Bearer トークンで独自に認証済み
// - /liff/*      — LINE アプリ内ブラウザから開かれ、LIFF ID Token で認証される
// - /api/members (GET) — LIFF 連携画面でメンバー一覧の選択に必要。
//                 返却データはメンバー表示名・初期・色のみで、口座情報は含まない
//                 (`bankAccount` は id の有無のみ返却)。
//
// 認証情報は環境変数 `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` で設定する
// (値は Vercel の Environment Variables に設定し、リポジトリには含めない)。
// 未設定時は fail-closed で全アクセスを拒否する。
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BYPASS_PATH_PREFIXES = ['/api/line/', '/liff/']

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl

  if (shouldBypass(pathname, req.method)) {
    return NextResponse.next()
  }

  const expectedUser = process.env.BASIC_AUTH_USER
  const expectedPass = process.env.BASIC_AUTH_PASS

  // fail-closed: credentials 未設定なら全拒否
  if (!expectedUser || !expectedPass) {
    return unauthorized()
  }

  const header = req.headers.get('authorization')
  if (!header || !header.startsWith('Basic ')) {
    return unauthorized()
  }

  const decoded = decodeBase64(header.slice('Basic '.length).trim())
  if (decoded === null) {
    return unauthorized()
  }

  const sepIdx = decoded.indexOf(':')
  if (sepIdx < 0) {
    return unauthorized()
  }
  const user = decoded.slice(0, sepIdx)
  const pass = decoded.slice(sepIdx + 1)

  if (user !== expectedUser || pass !== expectedPass) {
    return unauthorized()
  }

  return NextResponse.next()
}

function shouldBypass(pathname: string, method: string): boolean {
  for (const prefix of BYPASS_PATH_PREFIXES) {
    if (pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix)) {
      return true
    }
  }
  // LIFF 連携画面がメンバー選択に必要とする GET /api/members のみバイパス
  // (POST/PUT/DELETE は保護対象)
  if (method === 'GET' && pathname === '/api/members') {
    return true
  }
  return false
}

function decodeBase64(input: string): string | null {
  try {
    // Edge Runtime でも atob がグローバルに利用可能
    return atob(input)
  } catch {
    return null
  }
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="the-botch", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  })
}

// 静的アセットは middleware 対象外。
// _next/static, _next/image, favicon, robots.txt, 画像ファイル拡張子を除外する
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|map)$).*)',
  ],
}
