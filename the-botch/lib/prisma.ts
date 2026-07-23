import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// コネクションプール設定をコードで付与（Vercel環境変数の設定漏れ防止）
// Prisma 7: URL クエリの connection_limit / pool_timeout は廃止。pg Pool のオプションで指定する
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 10_000,
})

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : ['query', 'error', 'warn'],
  })

// 本番環境でもグローバルに保持し、Serverless関数のコールドスタートごとの再接続を防止
globalForPrisma.prisma = prisma
