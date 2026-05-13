// MS Graph API client — Outlook カレンダー同期用

const GRAPH_API = 'https://graph.microsoft.com/v1.0'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

// Warm instance でトークンを再利用するためのモジュールレベルキャッシュ
let tokenCache: TokenCache | null = null

export function isMsGraphEnabled(): boolean {
  return !!(
    process.env.MSGRAPH_TENANT_ID &&
    process.env.MSGRAPH_CLIENT_ID &&
    process.env.MSGRAPH_CLIENT_SECRET
  )
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken
  }

  const tenantId = process.env.MSGRAPH_TENANT_ID!
  const clientId = process.env.MSGRAPH_CLIENT_ID!
  const clientSecret = process.env.MSGRAPH_CLIENT_SECRET!

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MS Graph token fetch failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return tokenCache.accessToken
}

async function graphFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  return fetch(`${GRAPH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError
}

function sharedMailbox(): string {
  return process.env.MSGRAPH_SHARED_MAILBOX ?? 'thebotch@mnml.co.jp'
}

// 日付 → "YYYY-MM-DD" 文字列 (UTC 基準)
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// Outlook 終了日は exclusive (最終日 + 1 日)
function exclusiveEndDate(endDate: Date | null | undefined, startDate: Date): string {
  const base = endDate ?? startDate
  return toDateStr(new Date(base.getTime() + 24 * 60 * 60 * 1000))
}

interface OutlookEventPayload {
  title: string
  date: Date
  endDate?: Date | null
  description?: string | null
  attendeeEmails?: string[]
}

function buildOutlookEvent(payload: OutlookEventPayload): Record<string, unknown> {
  return {
    subject: payload.title,
    body: { contentType: 'text', content: payload.description ?? '' },
    start: { dateTime: `${toDateStr(payload.date)}T00:00:00.0000000`, timeZone: 'UTC' },
    end: {
      dateTime: `${exclusiveEndDate(payload.endDate, payload.date)}T00:00:00.0000000`,
      timeZone: 'UTC',
    },
    isAllDay: true,
    attendees: (payload.attendeeEmails ?? []).map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    })),
  }
}

// Outlook カレンダーイベントを作成し、生成された Outlook イベント ID を返す
export async function createOutlookEvent(payload: OutlookEventPayload): Promise<string> {
  return withRetry(async () => {
    const res = await graphFetch(`/users/${sharedMailbox()}/calendar/events`, {
      method: 'POST',
      body: JSON.stringify(buildOutlookEvent(payload)),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`createOutlookEvent failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as { id: string }
    return data.id
  })
}

// 既存 Outlook カレンダーイベントを更新
export async function updateOutlookEvent(
  outlookEventId: string,
  payload: OutlookEventPayload
): Promise<void> {
  return withRetry(async () => {
    const res = await graphFetch(
      `/users/${sharedMailbox()}/calendar/events/${outlookEventId}`,
      { method: 'PATCH', body: JSON.stringify(buildOutlookEvent(payload)) }
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`updateOutlookEvent failed: ${res.status} ${text}`)
    }
  })
}

// Outlook カレンダーイベントを削除 (404 は無視)
export async function deleteOutlookEvent(outlookEventId: string): Promise<void> {
  return withRetry(async () => {
    const res = await graphFetch(
      `/users/${sharedMailbox()}/calendar/events/${outlookEventId}`,
      { method: 'DELETE' }
    )
    if (!res.ok && res.status !== 404) {
      const text = await res.text()
      throw new Error(`deleteOutlookEvent failed: ${res.status} ${text}`)
    }
  })
}

export interface OutlookCalendarEvent {
  id: string
  subject: string
  isAllDay: boolean
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  body: { content: string | null }
}

// 共有メールボックスのカレンダーから期間内のイベント一覧を取得
export async function listOutlookEvents(
  startDate: Date,
  endDate: Date
): Promise<OutlookCalendarEvent[]> {
  return withRetry(async () => {
    const params = new URLSearchParams({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      $select: 'id,subject,isAllDay,start,end,body',
      $top: '100',
    })
    const res = await graphFetch(
      `/users/${sharedMailbox()}/calendar/calendarView?${params.toString()}`
    )
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`listOutlookEvents failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as { value: OutlookCalendarEvent[] }
    return data.value
  })
}
