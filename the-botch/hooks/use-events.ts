"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

export type CalendarEventSummary = {
  id: string;
  title: string;
  date: string;
};

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type OtokogiItem = {
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

type WarikanItem = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  manager: Member | null;
  participants: { member: Member }[];
  _count: { expenses: number };
};

export type EventDetail = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  description: string | null;
  eventType: string;
  createdBy: Member;
  participants: { member: Member }[];
  otokogiEvents: OtokogiItem[];
  warikanEvents: WarikanItem[];
};

export type EventCreateInput = {
  title: string;
  date: string;
  endDate: string | null;
  description: string | null;
  eventType: string;
  createdById: string;
  participantIds: string[];
};

export function useEvents() {
  return useQuery<CalendarEventSummary[], Error>({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('イベントの取得に失敗しました');
      return res.json() as Promise<CalendarEventSummary[]>;
    },
  });
}

export function useEventDetail(id: string) {
  return useQuery<EventDetail>({
    queryKey: ['event', id],
    queryFn: async () => {
      const res = await fetch(`/api/events/${id}`);
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) throw new Error('取得に失敗しました');
      return res.json();
    },
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCreateEvent(
  options?: UseMutationOptions<unknown, Error, EventCreateInput>
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, EventCreateInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '登録に失敗しました');
      }
      return res.json();
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useUnlinkEventOtokogi(
  eventId: string,
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (otokogiId) => {
      const res = await fetch(`/api/events/${eventId}/otokogi/${otokogiId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('紐付け解除に失敗しました');
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

export function useUnlinkEventWarikan(
  eventId: string,
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (warikanId) => {
      const res = await fetch(`/api/events/${eventId}/warikan/${warikanId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('紐付け解除に失敗しました');
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
