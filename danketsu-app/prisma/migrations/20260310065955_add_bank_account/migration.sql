-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('普通', '当座');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "bank_name" VARCHAR(50) NOT NULL,
    "branch_name" VARCHAR(50) NOT NULL,
    "account_type" "account_type" NOT NULL DEFAULT '普通',
    "account_number" VARCHAR(7) NOT NULL,
    "account_holder" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_member_id_key" ON "bank_accounts"("member_id");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
