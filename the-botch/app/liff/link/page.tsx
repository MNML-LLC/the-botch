'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'

type Status = 'loading' | 'selecting' | 'linking' | 'done' | 'error'

export default function LiffLinkPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [memberId, setMemberId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID
    if (!liffId) {
      setErrorMessage('LIFF ID が設定されていません')
      setStatus('error')
      return
    }

    liff
      .init({ liffId })
      .then(() => {
        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }
        setStatus('selecting')
      })
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : 'LIFF 初期化に失敗しました')
        setStatus('error')
      })
  }, [])

  async function handleLink() {
    if (!memberId.trim()) return
    setStatus('linking')

    try {
      const idToken = liff.getIDToken()
      if (!idToken) throw new Error('ID トークンを取得できませんでした')

      const res = await fetch('/api/line/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, memberId: memberId.trim() }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? '連携に失敗しました')
      }

      setStatus('done')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : '連携に失敗しました')
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">✓</p>
          <p className="mt-2 text-lg font-medium">連携完了しました</p>
          <p className="mt-1 text-sm text-gray-500">LINE 通知が届くようになりました。</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-red-500">!</p>
          <p className="mt-2 text-lg font-medium text-red-600">エラーが発生しました</p>
          <p className="mt-1 text-sm text-gray-500">{errorMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">LINE アカウント連携</h1>
          <p className="mt-1 text-sm text-gray-500">
            未払い精算の通知を LINE で受け取れるようになります。
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="memberId" className="block text-sm font-medium text-gray-700">
            メンバー ID
          </label>
          <input
            id="memberId"
            type="text"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            placeholder="メンバー ID を入力"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={status === 'linking'}
          />
          <p className="text-xs text-gray-400">管理者から共有されたメンバー ID を入力してください。</p>
        </div>

        <button
          onClick={handleLink}
          disabled={!memberId.trim() || status === 'linking'}
          className="w-full rounded-md bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'linking' ? '連携中...' : '連携する'}
        </button>
      </div>
    </div>
  )
}
