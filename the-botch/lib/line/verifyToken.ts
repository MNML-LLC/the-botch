interface LineVerifyResponse {
  iss: string
  sub: string
  aud: string
  exp: number
  iat: number
  name?: string
  picture?: string
  email?: string
}

// LIFF ID is "{channelId}-{liffAppId}" — the channel ID is the client_id for verification
function getChannelId(): string {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  if (!liffId) throw new Error('NEXT_PUBLIC_LIFF_ID is not set')
  return liffId.split('-')[0]
}

export async function verifyLineToken(idToken: string): Promise<{ sub: string; name?: string }> {
  const params = new URLSearchParams({
    id_token: idToken,
    client_id: getChannelId(),
  })

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LINE token verification failed: ${text}`)
  }

  const data = (await res.json()) as LineVerifyResponse
  return { sub: data.sub, name: data.name }
}
