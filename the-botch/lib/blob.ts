// Vercel Blob REST API wrapper — 追加パッケージ不要（native fetch を利用）
//
// BLOB_READ_WRITE_TOKEN が未設定のときは isBlobConfigured() が false を返し、
// 呼び出し側は UI を「未設定表示」にフォールバックする。

const BLOB_BASE_URL = process.env.BLOB_API_URL ?? 'https://blob.vercel-storage.com'

export interface BlobResult {
  url: string
  pathname: string
  contentType: string
  contentDisposition: string
}

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

export async function putBlob(
  pathname: string,
  body: Blob,
  options: { access: 'public'; contentType?: string },
): Promise<BlobResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN が設定されていません')

  const res = await fetch(`${BLOB_BASE_URL}/blob/${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'x-content-type': options.contentType ?? body.type ?? 'application/octet-stream',
      'x-access': options.access,
      'x-add-random-suffix': '1',
    },
    body,
  })

  if (!res.ok) {
    throw new Error(`Vercel Blob アップロード失敗: ${await res.text()}`)
  }

  return res.json() as Promise<BlobResult>
}

export async function deleteBlob(url: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN が設定されていません')

  const res = await fetch(`${BLOB_BASE_URL}/blob/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ urls: [url] }),
  })

  if (!res.ok) {
    throw new Error(`Vercel Blob 削除失敗: ${await res.text()}`)
  }
}
