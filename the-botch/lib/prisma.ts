import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// コネクションプール設定をコードで付与（Vercel環境変数の設定漏れ防止）
function buildDatasourceUrl(): string {
  const base = process.env.DATABASE_URL ?? ''
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}connection_limit=20&pool_timeout=10`
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: buildDatasourceUrl(),
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : ['query', 'error', 'warn'],
  })

// 本番環境でもグローバルに保持し、Serverless関数のコールドスタートごとの再接続を防止
globalForPrisma.prisma = prisma
