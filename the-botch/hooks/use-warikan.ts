"use client";

import { useCallback } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type ParticipantMember = {
  id: string;
  name: string;
};

export type WarikanListEvent = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  createdAt: string;
  manager: Member | null;
  participants: { member: ParticipantMember }[];
  _count: { expenses: number; settlements: number };
};

export type WarikanListResponse = {
  data: WarikanListEvent[];
  nextCursor: string | null;
};

export type WarikanCreateInput = {
  eventName: string;
  managerId: string | null;
  eventId: string | null;
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  participantIds: string[];
};

export type WarikanUpdateInput = Partial<{
  eventName: string;
  managerId: string | null;
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  walicaUrl: string | null;
  eventId: string | null;
  participantIds: string[];
}>;

type ExpenseInput = {
  payerId: string;
  description: string;
  amount: number;
  debtorIds?: string[];
};

type SettlementAction = 'pay' | 'receive';

export function useWarikanList(statusFilter: string, yearFilter: string) {
  const fetchWarikanEvents = useCallback(
    async ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (yearFilter !== 'all') params.set('year', yearFilter);
      if (pageParam) params.set('cursor', pageParam);

      const res = await fetch(`/api/warikan?${params.toString()}`);
      if (!res.ok) throw new Error('割り勘イベントの取得に失敗しました');
      return res.json() as Promise<WarikanListResponse>;
    },
    [statusFilter, yearFilter]
  );

  return useInfiniteQuery({
    queryKey: ['warikan', statusFilter, yearFilter],
    queryFn: fetchWarikanEvents,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useWarikanDetail<T>(id: string) {
  return useQuery({
    queryKey: ['warikan-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/warikan/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('割り勘イベントの取得に失敗しました');
      return res.json() as Promise<T>;
    },
    staleTime: 60 * 1000,
  });
}

export function useWarikanExpenses<T>(id: string) {
  return useQuery({
    queryKey: ['warikan-expenses', id],
    queryFn: async () => {
      const res = await fetch(`/api/warikan/${id}/expenses`);
      if (!res.ok) throw new Error('経費一覧の取得に失敗しました');
      return res.json() as Promise<T>;
    },
    staleTime: 60 * 1000,
  });
}

export function useWarikanSettlements<T>(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['warikan-settlements', id],
    queryFn: async () => {
      const res = await fetch(`/api/warikan/${id}/settlements`);
      if (!res.ok) throw new Error('精算一覧の取得に失敗しました');
      return res.json() as Promise<T>;
    },
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useCreateWarikan(
  options?: UseMutationOptions<{ id: string }, Error, WarikanCreateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, WarikanCreateInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/warikan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('作成に失敗しました');
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

function invalidateWarikanDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
) {
  queryClient.invalidateQueries({ queryKey: ['warikan-detail', id] });
  queryClient.invalidateQueries({ queryKey: ['warikan-expenses', id] });
  queryClient.invalidateQueries({ queryKey: ['warikan-settlements', id] });
}

export function useUpdateWarikan(
  id: string,
  options?: UseMutationOptions<unknown, Error, WarikanUpdateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, WarikanUpdateInput>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/warikan/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? '更新に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      invalidateWarikanDetail(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useAddWarikanExpense(
  id: string,
  options?: UseMutationOptions<unknown, Error, ExpenseInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, ExpenseInput>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/warikan/${id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useUpdateWarikanExpense(
  id: string,
  options?: UseMutationOptions<
    unknown,
    Error,
    { expenseId: string; input: ExpenseInput }
  >
) {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { expenseId: string; input: ExpenseInput }
  >({
    mutationFn: async ({ expenseId, input }) => {
      const res = await fetch(`/api/warikan/${id}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '更新に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useDeleteWarikanExpense(
  id: string,
  options?: UseMutationOptions<unknown, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: async (expenseId) => {
      const res = await fetch(`/api/warikan/${id}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '削除に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useCalculateWarikanSettlements(
  id: string,
  options?: UseMutationOptions<unknown, Error, void>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/warikan/${id}/settlements`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '精算計算に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useRevertWarikanToEntering(
  id: string,
  options?: UseMutationOptions<unknown, Error, void>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/warikan/${id}/revert-to-entering`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '明細修正に戻す処理に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useBulkCompleteWarikanSettlements(
  id: string,
  options?: UseMutationOptions<unknown, Error, void>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/warikan/${id}/settlements/bulk-complete`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '一括完了に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useWarikanSettlementAction(
  id: string,
  options?: UseMutationOptions<
    unknown,
    Error,
    { settlementId: string; action: SettlementAction }
  >
) {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { settlementId: string; action: SettlementAction }
  >({
    mutationFn: async ({ settlementId, action }) => {
      const res = await fetch(`/api/warikan/${id}/settlements/${settlementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '操作に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      invalidateWarikanDetail(queryClient, id);
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useDeleteWarikan(
  id: string,
  options?: UseMutationOptions<unknown, Error, void>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/warikan/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '削除に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
