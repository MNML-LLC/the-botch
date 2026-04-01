import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AccountType } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// GET /api/members/[id]/bank-account — 口座情報取得
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // メンバー存在チェック
    const member = await prisma.member.findUnique({ where: { id } })
    if (!member) {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }

    const bankAccount = await prisma.bankAccount.findUnique({
      where: { memberId: id },
    })

    // 未登録の場合はnullを返す
    return NextResponse.json(bankAccount)
  } catch (error) {
    console.error('口座情報取得エラー:', error)
    return NextResponse.json(
      { error: '口座情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// PUT /api/members/[id]/bank-account — 口座情報登録・更新（upsert）
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { bankName, branchName, accountType, accountNumber, accountHolder } = body

    // 入力バリデーション
    if (!bankName || typeof bankName !== 'string' || bankName.trim().length === 0) {
      return NextResponse.json(
        { error: '銀行名を入力してください' },
        { status: 400 }
      )
    }
    if (!branchName || typeof branchName !== 'string' || branchName.trim().length === 0) {
      return NextResponse.json(
        { error: '支店名を入力してください' },
        { status: 400 }
      )
    }
    if (!accountType || !Object.values(AccountType).includes(accountType)) {
      return NextResponse.json(
        { error: '口座種別が不正です' },
        { status: 400 }
      )
    }
    if (!accountNumber || typeof accountNumber !== 'string') {
      return NextResponse.json(
        { error: '口座番号を入力してください' },
        { status: 400 }
      )
    }
    if (!/^\d{1,7}$/.test(accountNumber)) {
      return NextResponse.json(
        { error: '口座番号は7桁以下の数字で入力してください' },
        { status: 400 }
      )
    }
    if (!accountHolder || typeof accountHolder !== 'string' || accountHolder.trim().length === 0) {
      return NextResponse.json(
        { error: '口座名義を入力してください' },
        { status: 400 }
      )
    }
    if (bankName.length > 50) {
      return NextResponse.json(
        { error: '銀行名は50文字以内で入力してください' },
        { status: 400 }
      )
    }
    if (branchName.length > 50) {
      return NextResponse.json(
        { error: '支店名は50文字以内で入力してください' },
        { status: 400 }
      )
    }
    if (accountHolder.length > 100) {
      return NextResponse.json(
        { error: '口座名義は100文字以内で入力してください' },
        { status: 400 }
      )
    }

    const bankAccount = await prisma.bankAccount.upsert({
      where: { memberId: id },
      update: {
        bankName: bankName.trim(),
        branchName: branchName.trim(),
        accountType,
        accountNumber,
        accountHolder: accountHolder.trim(),
      },
      create: {
        memberId: id,
        bankName: bankName.trim(),
        branchName: branchName.trim(),
        accountType,
        accountNumber,
        accountHolder: accountHolder.trim(),
      },
    })

    return NextResponse.json(bankAccount)
  } catch (error) {
    console.error('口座情報更新エラー:', error)
    // FK制約違反 = メンバーが存在しない
    if ((error as { code?: string }).code === 'P2003') {
      return NextResponse.json(
        { error: 'メンバーが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '口座情報の更新に失敗しました' },
      { status: 500 }
    )
  }
}

// DELETE /api/members/[id]/bank-account — 口座情報削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // FK制約があるため、bankAccountの削除のみで十分（P2025で存在チェック兼用）
    await prisma.bankAccount.delete({
      where: { memberId: id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('口座情報削除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: '口座情報が登録されていません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '口座情報の削除に失敗しました' },
      { status: 500 }
    )
  }
}
