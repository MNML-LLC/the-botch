-- CreateTable
CREATE TABLE "member_line_accounts" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "member_line_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_line_accounts_member_id_key" ON "member_line_accounts"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_line_accounts_line_user_id_key" ON "member_line_accounts"("line_user_id");

-- AddForeignKey
ALTER TABLE "member_line_accounts" ADD CONSTRAINT "member_line_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
