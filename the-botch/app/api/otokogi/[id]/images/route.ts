import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { isBlobConfigured, putBlob } from '@/lib/blob'

type Params = { params: Promise<{ id: string }> }

const MAX_IMAGES = 10
const MAX_SIZE_BYTES = 3 * 1024 * 1024

// GET /api/otokogi/[id]/images — 画像一覧
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const images = await prisma.otokogiImage.findMany({
      where: { otokogiEventId: id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(images)
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気画像一覧取得エラー',
      fallbackMessage: '画像一覧の取得に失敗しました',
    })
  }
}

// POST /api/otokogi/[id]/images — 画像アップロード
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    if (!isBlobConfigured()) {
      return NextResponse.json(
        { error: '画像アップロードは無効です（BLOB_READ_WRITE_TOKEN が未設定）' },
        { status: 503 },
      )
    }

    const event = await prisma.otokogiEvent.findUnique({
      where: { id },
      include: { _count: { select: { images: true } } },
    })

    if (!event) {
      return NextResponse.json({ error: '男気イベントが見つかりません' }, { status: 404 })
    }

    if (event._count.images >= MAX_IMAGES) {
      return NextResponse.json(
        { error: `1イベントあたりの画像は最大${MAX_IMAGES}枚です` },
        { status: 400 },
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'ファイルが指定されていません' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '画像ファイルのみアップロードできます' }, { status: 400 })
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: '画像サイズは3MB以下にしてください' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const pathname = `otokogi/${id}/${Date.now()}.${ext}`
    const blob = await putBlob(pathname, file, { access: 'public', contentType: file.type })

    const [image] = await prisma.$transaction([
      prisma.otokogiImage.create({
        data: { otokogiEventId: id, url: blob.url },
      }),
      prisma.otokogiEvent.update({
        where: { id },
        data: { hasAlbum: true },
      }),
    ])

    return NextResponse.json(image, { status: 201 })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気画像アップロードエラー',
      fallbackMessage: '画像のアップロードに失敗しました',
    })
  }
}
