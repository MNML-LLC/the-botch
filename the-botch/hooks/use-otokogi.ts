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

export type OtokogiEvent = {
  id: string;
  eventDate: string;
  eventName: string;
  amount: number;
  place: string | null;
  memo: string | null;
  hasAlbum: boolean;
  payer: Member;
  participants: { member: Member }[];
};

export type OtokogiResponse = {
  data: OtokogiEvent[];
  nextCursor: string | null;
};

export type OtokogiRankingEntry = {
  rank: number;
  memberId: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
  count: number;
  totalPaid: number;
};

export type OtokogiRankingResponse = {
  ranking: OtokogiRankingEntry[];
};

export type OtokogiCreateInput = {
  eventDate: string;
  eventName: string;
  payerId: string;
  amount: number;
  place: string | null;
  hasAlbum: boolean;
  memo: string | null;
  eventId: string | null;
  participantIds: string[];
};

export type OtokogiUpdateInput = Partial<{
  eventDate: string;
  eventName: string;
  payerId: string;
  amount: number;
  place: string | null;
  hasAlbum: boolean;
  memo: string | null;
  participantIds: string[];
}>;

export type OtokogiEventDetail = OtokogiEvent & {
  payerId: string;
  eventId: string | null;
};

export function useOtokogiEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['otokogi-event', id],
    queryFn: async () => {
      const res = await fetch(`/api/otokogi/${id}`);
      if (!res.ok) throw new Error('男気イベントの取得に失敗しました');
      return res.json() as Promise<OtokogiEventDetail>;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOtokogiEvents(yearFilter: string) {
  const fetchOtokogiEvents = useCallback(
    async ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams();
      if (yearFilter !== 'all') params.set('year', yearFilter);
      if (pageParam) params.set('cursor', pageParam);

      const res = await fetch(`/api/otokogi?${params.toString()}`);
      if (!res.ok) throw new Error('男気イベントの取得に失敗しました');
      return res.json() as Promise<OtokogiResponse>;
    },
    [yearFilter]
  );

  return useInfiniteQuery({
    queryKey: ['otokogi', yearFilter],
    queryFn: fetchOtokogiEvents,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOtokogiRanking(yearFilter: string) {
  return useQuery({
    queryKey: ['otokogi-ranking', yearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (yearFilter !== 'all') params.set('year', yearFilter);
      const res = await fetch(`/api/otokogi/ranking?${params.toString()}`);
      if (!res.ok) throw new Error('ランキングの取得に失敗しました');
      return res.json() as Promise<OtokogiRankingResponse>;
    },
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOtokogiStats<T>(yearFilter: string) {
  return useQuery({
    queryKey: ['otokogi-stats', yearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (yearFilter !== 'all') params.set('year', yearFilter);
      const res = await fetch(`/api/otokogi/stats?${params.toString()}`);
      if (!res.ok) throw new Error('統計データの取得に失敗しました');
      return res.json() as Promise<T>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOtokogiStatsMain<T>(
  from: string | undefined,
  to: string | undefined,
  memberIds: string[]
) {
  return useQuery({
    queryKey: ['otokogi-stats-main', from, to, memberIds.join(',')],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (memberIds.length > 0) params.set('memberIds', memberIds.join(','));
      const res = await fetch(`/api/otokogi/stats?${params.toString()}`);
      if (!res.ok) throw new Error('統計データの取得に失敗しました');
      return res.json() as Promise<T>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOtokogiMemberSummary<T>(
  from: string | undefined,
  to: string | undefined,
  memberIds?: string[]
) {
  const memberIdsKey = memberIds ? memberIds.join(',') : undefined;
  return useQuery({
    queryKey:
      memberIds !== undefined
        ? ['otokogi-member-summary', from, to, memberIdsKey]
        : ['otokogi-member-summary', from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (memberIds && memberIds.length > 0) {
        params.set('memberIds', memberIds.join(','));
      }
      const res = await fetch(`/api/otokogi/member-summary?${params.toString()}`);
      if (!res.ok) throw new Error('収支データの取得に失敗しました');
      return res.json() as Promise<T>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCreateOtokogi(
  options?: UseMutationOptions<unknown, Error, OtokogiCreateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, OtokogiCreateInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/otokogi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('登録に失敗しました');
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['otokogi'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useUpdateOtokogi(
  id: string,
  options?: UseMutationOptions<unknown, Error, OtokogiUpdateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, OtokogiUpdateInput>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/otokogi/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ['otokogi'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-event', id] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
