// Vercel Blob ラッパー — 公式パッケージ `@vercel/blob` を使用する。
//
// BLOB_READ_WRITE_TOKEN が未設定のときは isBlobConfigured() が false を返し、
// 呼び出し側は UI を「未設定表示」にフォールバックする。

import { del, put, type PutBlobResult } from '@vercel/blob'

export type BlobResult = PutBlobResult

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

  return put(pathname, body, {
    access: options.access,
    contentType: options.contentType ?? body.type ?? undefined,
    addRandomSuffix: true,
    token,
  })
}

export async function deleteBlob(url: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN が設定されていません')

  await del(url, { token })
}
