import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteBlob } from '@/lib/blob'

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

    await deleteBlob(image.url)
    await prisma.otokogiImage.delete({ where: { id: imageId } })

    const remaining = await prisma.otokogiImage.count({ where: { otokogiEventId: id } })
    if (remaining === 0) {
      await prisma.otokogiEvent.update({ where: { id }, data: { hasAlbum: false } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('画像削除エラー:', error)
    return NextResponse.json({ error: '画像の削除に失敗しました' }, { status: 500 })
  }
}
