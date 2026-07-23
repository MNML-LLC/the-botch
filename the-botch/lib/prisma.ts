import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// コネクションプール設定をコードで付与（Vercel環境変数の設定漏れ防止）
// Prisma 7: URL クエリの connection_limit / pool_timeout は廃止。pg Pool のオプションで指定する
// Vercel サーバーレスでは関数インスタンスごとに独立したプールが作られるため、
// インスタンスあたり 1 コネクションに抑えて DB 側のコネクション枯渇を防ぐ
// （長寿命プロセスでは DATABASE_POOL_MAX で引き上げ可能）
const poolMax =
  Number(process.env.DATABASE_POOL_MAX) || (process.env.VERCEL ? 1 : 5)

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  // 旧 pool_timeout=20 相当: プールからの接続取得を最大 20 秒待つ
  connectionTimeoutMillis: 20_000,
  // サスペンドされたインスタンスがアイドル接続を占有し続けないよう早めに解放する
  idleTimeoutMillis: 30_000,
  allowExitOnIdle: true,
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
