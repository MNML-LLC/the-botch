"use client";

import { useQuery } from '@tanstack/react-query';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  description: string | null;
  eventType: string;
  createdBy: Member;
  participants: { member: Member }[];
};

export type CalendarOtokogiEvent = {
  id: string;
  eventDate: string;
  eventName: string;
  amount: number;
  memo: string | null;
  payer: Member;
};

export type CalendarWarikanEvent = {
  id: string;
  eventName: string;
  status: string;
  memo: string | null;
  createdAt: string;
  displayDate: string | null;
  manager: Member | null;
};

export type CalendarData = {
  events: CalendarEvent[];
  otokogiEvents: CalendarOtokogiEvent[];
  warikanEvents: CalendarWarikanEvent[];
};

export function useCalendar(year: number, month: number) {
  return useQuery<CalendarData>({
    queryKey: ['calendar', year, month],
    queryFn: async () => {
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
      if (!res.ok) throw new Error('カレンダーデータの取得に失敗しました');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
