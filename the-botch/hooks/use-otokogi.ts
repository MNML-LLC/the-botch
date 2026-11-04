"use client";

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import {
  appendPeriodSearchParams,
  getFiscalYearRange,
  getPeriodRange,
  type PeriodState,
} from '@/lib/date-utils';
import {
  computeBadges,
  type Badge,
  type BadgeContext,
} from '@/lib/otokogi-badges';

function periodKey(state: PeriodState): string {
  return state.period === 'custom'
    ? `custom|${state.from ?? ''}|${state.to ?? ''}`
    : state.period;
}

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
  wasJanken: boolean;
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
  clutchCount: number;
  participationCount: number;
  otokogiRate: number;
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
  wasJanken: boolean;
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
  wasJanken: boolean;
  memo: string | null;
  participantIds: string[];
}>;

export type OtokogiImage = {
  id: string;
  otokogiEventId: string;
  url: string;
  createdAt: string;
};

export type OtokogiEventDetail = OtokogiEvent & {
  payerId: string;
  eventId: string | null;
  images: OtokogiImage[];
  blobEnabled: boolean;
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

export function useOtokogiEvents(period: PeriodState) {
  const key = periodKey(period);
  const fetchOtokogiEvents = useCallback(
    async ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams();
      appendPeriodSearchParams(params, period);
      if (pageParam) params.set('cursor', pageParam);

      const res = await fetch(`/api/otokogi?${params.toString()}`);
      if (!res.ok) throw new Error('男気イベントの取得に失敗しました');
      return res.json() as Promise<OtokogiResponse>;
    },
    [period]
  );

  return useInfiniteQuery({
    queryKey: ['otokogi', key],
    queryFn: fetchOtokogiEvents,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOtokogiRanking(period: PeriodState) {
  const key = periodKey(period);
  return useQuery({
    queryKey: ['otokogi-ranking', key],
    queryFn: async () => {
      const params = new URLSearchParams();
      appendPeriodSearchParams(params, period);
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

export type OtokogiChartsResponse = {
  heatmap: {
    months: string[];
    members: Member[];
    cells: { month: string; memberId: string; amount: number }[];
  };
  monthMemberHeatmap: {
    months: string[];
    members: Member[];
    cells: { month: string; memberId: string; amount: number }[];
    maxAmount: number;
  };
  // Issue #400: 期間内月を軸に累積総額 1 本に変更
  //   month: 'YYYY-MM', cumulative: anchor より未来は null
  cumulativeYearly: {
    month: string;
    cumulative: number | null;
  }[];
  topRecent: {
    id: string;
    eventName: string;
    eventDate: string;
    amount: number;
    place: string | null;
    payer: Member;
  }[];
  members: Member[];
  periodLabel: { from: string | null; to: string | null };
  anchorYear: number;
};

export function useOtokogiCharts(
  from: string | undefined,
  to: string | undefined,
  memberIds?: string[]
) {
  const memberIdsKey = memberIds ? memberIds.join(',') : undefined;
  return useQuery({
    queryKey:
      memberIds !== undefined
        ? ['otokogi-charts', from, to, memberIdsKey]
        : ['otokogi-charts', from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (memberIds && memberIds.length > 0) {
        params.set('memberIds', memberIds.join(','));
      }
      const res = await fetch(`/api/otokogi/charts?${params.toString()}`);
      if (!res.ok) throw new Error('チャートデータの取得に失敗しました');
      return res.json() as Promise<OtokogiChartsResponse>;
    },
    staleTime: 60 * 1000,
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
      queryClient.invalidateQueries({ queryKey: ['otokogi-charts'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-member-summary'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-fy-badges'] });
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
      queryClient.invalidateQueries({ queryKey: ['otokogi-charts'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-member-summary'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-fy-badges'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useDeleteOtokogi(
  id: string,
  options?: UseMutationOptions<unknown, Error, void>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await fetch(`/api/otokogi/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? '削除に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['otokogi'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-event', id] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-charts'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-member-summary'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-fy-badges'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

// ===== 男気称号バッジ (Issue #368) =====
//
// /api/otokogi/stats + /api/otokogi/member-summary のレスポンスを合成して
// メンバー別の保有バッジを計算する。期間フィルタ連動 (period=all もサポート)。

type BadgeStatsResponse = {
  streaks: { id: string; maxStreak: number }[];
};

type BadgeMemberSummaryResponse = {
  members: {
    memberId: string;
    memberName: string;
    payerCount: number;
    participationCount: number;
    // Issue #393: MVP を actualPaid ベースに変更したため必須化
    actualPaid: number;
    shouldHavePaid: number;
    // Issue #401: 裏男気王 を期間フィルタ版でも判定するため必須
    otokogiAmount: number;
    averagePaymentAmount: number;
    maxSingleOtokogi: number;
    clutchCount: number;
    jankenWinRate: number | null;
    jankenParticipationCount: number;
  }[];
};

// 期間から MVP ラベル用の文字列を決める
// - current-fy / last-fy: "FYxx"
// - current-month: "YYYY/M月"
// - custom: "YYYY/M–YYYY/M"
// - all: "通算"
function badgePeriodLabel(period: PeriodState, ref: Date = new Date()): string {
  switch (period.period) {
    case 'current-fy': {
      const r = getFiscalYearRange(ref, 0);
      return `FY${(r.fy % 100).toString().padStart(2, '0')}`;
    }
    case 'last-fy': {
      const r = getFiscalYearRange(ref, -1);
      return `FY${(r.fy % 100).toString().padStart(2, '0')}`;
    }
    case 'current-month':
      return `${ref.getFullYear()}/${ref.getMonth() + 1}月`;
    case 'custom': {
      const r = getPeriodRange('custom', ref, { from: period.from, to: period.to });
      const from = r.from
        ? `${r.from.getFullYear()}/${r.from.getMonth() + 1}`
        : '';
      const to = r.to
        ? `${r.to.getFullYear()}/${r.to.getMonth() + 1}`
        : '';
      return from && to ? `${from}–${to}` : from || to || 'カスタム';
    }
    case 'all':
    default:
      return '通算';
  }
}

export function useOtokogiBadges(period: PeriodState) {
  const key = period.period === 'custom'
    ? `custom|${period.from ?? ''}|${period.to ?? ''}`
    : period.period;

  const fetchParams = useMemo(() => {
    const params = new URLSearchParams();
    const r = getPeriodRange(period.period, new Date(), {
      from: period.from,
      to: period.to,
    });
    if (r.from) params.set('from', toIso(r.from));
    if (r.to) params.set('to', toIso(r.to));
    return params.toString();
  }, [period]);

  const statsQuery = useQuery({
    queryKey: ['otokogi-badges-stats', key],
    queryFn: async () => {
      const res = await fetch(`/api/otokogi/stats?${fetchParams}`);
      if (!res.ok) throw new Error('バッジ用統計の取得に失敗しました');
      return res.json() as Promise<BadgeStatsResponse>;
    },
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ['otokogi-badges-summary', key],
    queryFn: async () => {
      const res = await fetch(`/api/otokogi/member-summary?${fetchParams}`);
      if (!res.ok) throw new Error('バッジ用収支の取得に失敗しました');
      return res.json() as Promise<BadgeMemberSummaryResponse>;
    },
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const periodLabel = useMemo(() => badgePeriodLabel(period), [period]);

  const memberSummariesById = useMemo(() => {
    const map = new Map<string, BadgeMemberSummaryResponse['members'][number]>();
    if (!summaryQuery.data) return map;
    for (const m of summaryQuery.data.members ?? []) map.set(m.memberId, m);
    return map;
  }, [summaryQuery.data]);

  const streaksById = useMemo(() => {
    const map = new Map<string, number>();
    if (!statsQuery.data) return map;
    for (const s of statsQuery.data.streaks ?? []) map.set(s.id, s.maxStreak);
    return map;
  }, [statsQuery.data]);

  const badgesByMember = useMemo(() => {
    const map = new Map<string, Badge[]>();
    if (!statsQuery.data || !summaryQuery.data) return map;
    const ctx: BadgeContext = {
      periodLabel,
      streaks: statsQuery.data.streaks ?? [],
      memberSummaries: summaryQuery.data.members ?? [],
    };
    const ids = new Set<string>();
    for (const m of ctx.memberSummaries) ids.add(m.memberId);
    for (const id of ids) {
      map.set(id, computeBadges(id, ctx));
    }
    return map;
  }, [periodLabel, statsQuery.data, summaryQuery.data]);

  return {
    badgesByMember,
    memberSummariesById,
    streaksById,
    periodLabel,
    isLoading: statsQuery.isLoading || summaryQuery.isLoading,
    isError: statsQuery.isError || summaryQuery.isError,
  };
}

function toIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ===== FY (会計年度) ベースの男気バッジ (Issue #393) =====
//
// 全データを走査して FY ごとに独立計算したバッジ履歴を返す。
// タイムライン表示 (メンバー詳細ページの "称号履歴") で使用する。

export type FyAggregateEntry = {
  memberId: string;
  payerCount: number;
  actualPaid: number;
  shouldHavePaid: number;
  shadowOtokogi: number;
  averagePaymentAmount: number;
  maxStreak: number;
};

export type FyBadgesEntry = {
  fy: number;
  shortLabel: string;
  from: string;
  to: string;
  eventCount: number;
  totalAmount: number;
  aggregates: FyAggregateEntry[];
  badges: {
    memberId: string;
    badges: Badge[];
  }[];
};

export type FyBadgesResponse = {
  fiscalYears: FyBadgesEntry[];
  members: {
    id: string;
    name: string;
    initial: string;
    colorBg: string;
    colorText: string;
  }[];
};

export function useFyBadges() {
  return useQuery({
    queryKey: ['otokogi-fy-badges'],
    queryFn: async () => {
      const res = await fetch('/api/otokogi/fy-badges');
      if (!res.ok) throw new Error('FY バッジの取得に失敗しました');
      return res.json() as Promise<FyBadgesResponse>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
