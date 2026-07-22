import { defineConfig } from 'prisma/config'

// Prisma 7 の CLI は .env を自動読み込みしないため、ここで明示的に読み込む。
// .env.local を優先し、既に設定済みの環境変数は上書きしない（--env-file と同挙動）。
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // ファイルが無ければスキップ
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Migrate / db pull 用の接続URL（アプリ本体は lib/prisma.ts の driver adapter を使用）。
    // prisma/config の env() は未設定時に即例外を投げ、DB 不要な `prisma generate`
    //（npm ci の postinstall）まで失敗させるため、プレースホルダーでフォールバックする。
    url:
      process.env.DATABASE_URL ??
      'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
})
