-- CreateTable
CREATE TABLE "warikan_expense_debtors" (
    "expense_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,

    CONSTRAINT "warikan_expense_debtors_pkey" PRIMARY KEY ("expense_id","member_id")
);

-- AddForeignKey
ALTER TABLE "warikan_expense_debtors" ADD CONSTRAINT "warikan_expense_debtors_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "warikan_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warikan_expense_debtors" ADD CONSTRAINT "warikan_expense_debtors_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
