"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

export type Member = {
  id: string;
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
  paypayId: string | null;
  bankAccount: { id: string } | null;
  isActive: boolean;
};

export type BankAccountData = {
  bankName: string;
  branchName: string;
  accountType: 'SAVINGS' | 'CHECKING';
  accountNumber: string;
  accountHolder: string;
};

export type MemberProfileOtokogiEvent = {
  id: string;
  eventDate: string;
  eventName: string;
  amount: number;
  place: string | null;
  payer: {
    id: string;
    name: string;
    initial: string;
    colorBg: string;
    colorText: string;
  };
};

export type MemberProfileWarikanEvent = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  detailDeadline: string | null;
  paymentDeadline: string | null;
  displayDate: string | null;
  createdAt: string;
};

export type MemberProfileStats = {
  otokogiParticipationCount: number;
  warikanParticipationCount: number;
  otokogiPaidCount: number;
  otokogiPaidTotal: number;
  warikanPaidCount: number;
  warikanPaidTotal: number;
  totalPaid: number;
};

export type MemberDetail = {
  id: string;
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
  paypayId: string | null;
  isActive: boolean;
  otokogiParticipations: { otokogiEvent: MemberProfileOtokogiEvent }[];
  warikanParticipations: { warikanEvent: MemberProfileWarikanEvent }[];
  stats: MemberProfileStats;
};

export type MemberCreateInput = {
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
  paypayId: string | null;
};

export type MemberUpdateInput = MemberCreateInput & {
  isActive: boolean;
};

/**
 * メンバー更新 API のエラー。ステータスコードとサーバーが返した追加情報を保持する。
 * 特に 409（進行中割り勘イベントに参加中）を UI が識別するために使用する。
 */
export class MemberUpdateError extends Error {
  readonly status: number;
  readonly inProgressCount?: number;

  constructor(message: string, status: number, inProgressCount?: number) {
    super(message);
    this.name = 'MemberUpdateError';
    this.status = status;
    this.inProgressCount = inProgressCount;
  }
}

export type MembersQueryOptions = {
  staleTime?: number;
  gcTime?: number;
  enabled?: boolean;
};

export function useMembers(options?: MembersQueryOptions) {
  return useQuery<Member[], Error>({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await fetch('/api/members');
      if (!res.ok) throw new Error('メンバーの取得に失敗しました');
      return res.json() as Promise<Member[]>;
    },
    ...options,
  });
}

export function useMemberDetail(id: string) {
  return useQuery({
    queryKey: ['member-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/members/${id}`);
      if (!res.ok) throw new Error('メンバー情報の取得に失敗しました');
      return res.json() as Promise<MemberDetail>;
    },
  });
}

export function useMemberBankAccount(id: string) {
  return useQuery({
    queryKey: ['member-bank-account', id],
    queryFn: async () => {
      const res = await fetch(`/api/members/${id}/bank-account`);
      if (!res.ok) throw new Error('口座情報の取得に失敗しました');
      return res.json() as Promise<BankAccountData | null>;
    },
  });
}

export function useCreateMember(
  options?: UseMutationOptions<unknown, Error, MemberCreateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, MemberCreateInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '作成に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useUpdateMember(
  id: string,
  options?: UseMutationOptions<unknown, Error, MemberUpdateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, MemberUpdateInput>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data: { error?: string; inProgressCount?: number } = await res
          .json()
          .catch(() => ({}));
        throw new MemberUpdateError(
          data.error || '更新に失敗しました',
          res.status,
          typeof data.inProgressCount === 'number' ? data.inProgressCount : undefined
        );
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member-detail', id] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useSaveMemberBankAccount(
  id: string,
  options?: UseMutationOptions<unknown, Error, BankAccountData>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, BankAccountData>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/members/${id}/bank-account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '口座情報の保存に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['member-bank-account', id] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useDeleteMemberBankAccount(
  id: string,
  options?: UseMutationOptions<unknown, Error, void>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/members/${id}/bank-account`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '口座情報の削除に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['member-bank-account', id] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
