import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

// GET /api/warikan/[id]/expenses — 割り勘立替明細一覧
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const expenses = await prisma.warikanExpense.findMany({
      where: { warikanEventId: id },
      include: {
        payer: {
          select: { id: true, name: true, initial: true, colorBg: true, colorText: true },
        },
        debtors: {
          include: {
            member: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(expenses)
  } catch (error) {
    console.error('立替明細一覧取得エラー:', error)
    return NextResponse.json(
      { error: '立替明細一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST /api/warikan/[id]/expenses — 立替明細追加
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { payerId, description, amount, debtorIds } = body as {
      payerId: string
      description: string
      amount: number
      debtorIds?: string[] // 対象者。省略時は全参加者
    }

    if (!payerId || !description || amount === undefined) {
      return NextResponse.json(
        { error: 'payerId, description, amount は必須です' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount は1以上の整数を指定してください' },
        { status: 400 }
      )
    }

    // 割り勘イベント＋参加者を取得
    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
      include: { participants: true },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    if (warikanEvent.status !== 'ENTERING') {
      return NextResponse.json(
        { error: '明細入力中のイベントにのみ追加できます' },
        { status: 400 }
      )
    }

    // 対象者：指定がなければ全参加者
    const targetDebtorIds = debtorIds && debtorIds.length > 0
      ? debtorIds
      : warikanEvent.participants.map((p) => p.memberId)

    const expense = await prisma.warikanExpense.create({
      data: {
        warikanEventId: id,
        payerId,
        description,
        amount,
        debtors: {
          create: targetDebtorIds.map((memberId) => ({ memberId })),
        },
      },
      include: {
        payer: true,
        debtors: { include: { member: true } },
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('立替明細追加エラー:', error)
    return NextResponse.json(
      { error: '立替明細の追加に失敗しました' },
      { status: 500 }
    )
  }
}
