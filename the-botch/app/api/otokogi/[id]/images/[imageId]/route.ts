import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { deleteBlob, isBlobConfigured } from '@/lib/blob'

type Params = { params: Promise<{ id: string; imageId: string }> }

// DELETE /api/otokogi/[id]/images/[imageId] — 画像削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, imageId } = await params

    const image = await prisma.otokogiImage.findFirst({
      where: { id: imageId, otokogiEventId: id },
    })

    if (!image) {
      return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
    }

    // Blob 未設定でも DB レコードは削除できるようにする（トークン取り外し後のクリーンアップ用）
    if (isBlobConfigured()) {
      try {
        await deleteBlob(image.url)
      } catch (blobError) {
        console.error('Vercel Blob 削除失敗（DB からは削除を継続）:', blobError)
      }
    }

    await prisma.otokogiImage.delete({ where: { id: imageId } })

    const remaining = await prisma.otokogiImage.count({ where: { otokogiEventId: id } })
    if (remaining === 0) {
      await prisma.otokogiEvent.update({ where: { id }, data: { hasAlbum: false } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気画像削除エラー',
      fallbackMessage: '画像の削除に失敗しました',
    })
  }
}
