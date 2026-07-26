"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

export type WalicaMemberMatch = {
  walicaId: string;
  walicaName: string;
  matchedMemberId: string | null;
  matchedMemberName: string | null;
  confidence: number;
};

export type WalicaExpense = {
  itemName: string;
  amount: number;
  payerName: string;
  debtorNames: string[];
  date: string | null;
};

export type WalicaSettlement = {
  senderName: string;
  receiverName: string;
  amount: number;
};

export type WalicaPreviewData = {
  groupName: string;
  currency: string;
  members: WalicaMemberMatch[];
  expenses: WalicaExpense[];
  settlements: WalicaSettlement[];
  totalAmount: number;
  expenseCount: number;
};

export type WalicaImportInput = {
  walicaUrl: string;
  memberMapping: {
    walicaId: string;
    walicaName: string;
    appMemberId: string;
  }[];
};

export type WalicaImportResult = {
  event: { id: string };
};

export function useWalicaPreview(
  options?: UseMutationOptions<WalicaPreviewData, Error, string>
) {
  return useMutation<WalicaPreviewData, Error, string>({
    mutationFn: async (url) => {
      const res = await fetch(`/api/walica/preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'データの取得に失敗しました');
      }
      return res.json() as Promise<WalicaPreviewData>;
    },
    ...options,
  });
}

export function useWalicaImport(
  options?: UseMutationOptions<WalicaImportResult, Error, WalicaImportInput>
) {
  const queryClient = useQueryClient();
  return useMutation<WalicaImportResult, Error, WalicaImportInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/walica/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'インポートに失敗しました');
      }
      return res.json() as Promise<WalicaImportResult>;
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
