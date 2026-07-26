"use client";

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EVENT_TYPE_LABELS } from '@/lib/constants';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  description: string | null;
  eventType: string;
  createdBy: Member;
  participants: { member: Member }[];
};

type OtokogiEvent = {
  id: string;
  eventDate: string;
  eventName: string;
  amount: number;
  memo: string | null;
  payer: Member;
};

type WarikanEvent = {
  id: string;
  eventName: string;
  status: string;
  memo: string | null;
  createdAt: string;
  displayDate: string | null;
  manager: Member | null;
};

type DayData = {
  date: number;
  events: CalendarEvent[];
  otokogi: OtokogiEvent[];
  warikan: WarikanEvent[];
};

// イベントタイプの色
function eventTypeColor(type: string) {
  switch (type) {
    case 'TRIP': return 'bg-blue-500';
    case 'HANGOUT': return 'bg-green-500';
    case 'ACTIVITY': return 'bg-purple-500';
    default: return 'bg-gray-500';
  }
}

function eventTypeLabel(type: string) {
  if (type in EVENT_TYPE_LABELS) {
    return EVENT_TYPE_LABELS[type as keyof typeof EVENT_TYPE_LABELS];
  }
  return EVENT_TYPE_LABELS.OTHER;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data: calendarData } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: async () => {
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
      if (!res.ok) throw new Error('カレンダーデータの取得に失敗しました');
      return res.json() as Promise<{
        events: CalendarEvent[];
        otokogiEvents: OtokogiEvent[];
        warikanEvents: WarikanEvent[];
      }>;
    },
    staleTime: 10 * 60 * 1000, // 10分（月切替時の再フェッチ抑制）
    gcTime: 30 * 60 * 1000,    // 30分GC（前後月をキャッシュ保持）
  });

  // 月の日数と開始曜日
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=日

  // 日付ごとのデータを事前にMapで構築（O(1)ルックアップ）
  const dayDataMap = useMemo(() => {
    const map = new Map<string, DayData>();
    if (!calendarData) return map;

    // 月の全日付を初期化
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      map.set(dateStr, { date: day, events: [], otokogi: [], warikan: [] });
    }

    // カレンダーイベント: 開始日〜終了日の各日に追加
    for (const e of calendarData.events) {
      const start = e.date.slice(0, 10);
      const end = e.endDate?.slice(0, 10) ?? start;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr >= start && dateStr <= end) {
          map.get(dateStr)?.events.push(e);
        }
      }
    }

    // 男気イベント: 日付でマッピング
    for (const o of calendarData.otokogiEvents) {
      const dateStr = o.eventDate.slice(0, 10);
      map.get(dateStr)?.otokogi.push(o);
    }

    // 割り勘イベント: displayDate でマッピング
    for (const w of calendarData.warikanEvents) {
      const dateStr = w.displayDate ?? w.createdAt.slice(0, 10);
      map.get(dateStr)?.warikan.push(w);
    }

    return map;
  }, [calendarData, year, month, daysInMonth]);

  // レンダリング時のルックアップ（O(1)）
  function getDayData(day: number): DayData {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dayDataMap.get(dateStr) ?? { date: day, events: [], otokogi: [], warikan: [] };
  }

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
    setSelectedDay(null);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
    setSelectedDay(null);
  };
  const today = () => {
    setCurrentDate(new Date());
    setSelectedDay(null);
  };

  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">カレンダー</h2>
        <Button asChild className="bg-slate-800 hover:bg-slate-700">
          <Link href="/calendar/new">+ 予定追加</Link>
        </Button>
      </div>

      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-md">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-slate-800">{year}年{month}月</span>
          <button onClick={today} className="text-xs text-gray-500 hover:text-slate-800 px-2 py-1 rounded border">
            今日
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-md">
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span className="text-[10px] text-gray-500">男気</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-sky-500" /><span className="text-[10px] text-gray-500">割り勘</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-[10px] text-gray-500">{EVENT_TYPE_LABELS.HANGOUT}</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-[10px] text-gray-500">{EVENT_TYPE_LABELS.TRIP}</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-purple-500" /><span className="text-[10px] text-gray-500">{EVENT_TYPE_LABELS.ACTIVITY}</span></div>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((day, i) => (
            <div key={day} className={`text-center text-xs font-medium py-2 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}>
              {day}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        <div className="grid grid-cols-7">
          {/* 空セル（月初の前） */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-14 border-b border-r last:border-r-0 bg-gray-50" />
          ))}

          {/* 日付セル */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayData = getDayData(day);
            const hasData = dayData.events.length > 0 || dayData.otokogi.length > 0 || dayData.warikan.length > 0;
            const isToday = year === new Date().getFullYear() && month === new Date().getMonth() + 1 && day === new Date().getDate();
            const isSelected = selectedDay?.date === day;
            const dayOfWeek = (firstDayOfWeek + i) % 7;

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(hasData ? dayData : null)}
                className={`min-h-14 p-0.5 border-b border-r text-left transition-colors ${
                  isSelected ? 'bg-amber-50' : hasData ? 'hover:bg-gray-50 cursor-pointer' : ''
                }`}
              >
                <div className={`text-xs font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-slate-800 text-white' :
                  dayOfWeek === 0 ? 'text-red-500' :
                  dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'
                }`}>
                  {day}
                </div>
                {/* ドットインジケーター */}
                <div className="flex flex-wrap gap-0.5 px-0.5">
                  {dayData.otokogi.map((o) => (
                    <div key={o.id} className="w-1.5 h-1.5 rounded-full bg-amber-500" title={`男気: ${o.eventName}`} />
                  ))}
                  {dayData.warikan.map((w) => (
                    <div key={w.id} className="w-1.5 h-1.5 rounded-full bg-sky-500" title={`割り勘: ${w.eventName}`} />
                  ))}
                  {dayData.events.map((e) => (
                    <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${eventTypeColor(e.eventType)}`} title={e.title} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 選択した日の詳細 */}
      {selectedDay && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-bold text-slate-800">
            {month}/{selectedDay.date} の予定
          </h3>

          {/* カレンダーイベント */}
          {selectedDay.events.map((e) => (
            <div key={e.id} className="bg-white rounded-lg p-3 border shadow-sm">
              <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${eventTypeColor(e.eventType)}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 text-sm">{e.title}</p>
                  <p className="text-xs text-gray-500">
                    {eventTypeLabel(e.eventType)}
                    {e.endDate && e.endDate !== e.date && ` (〜${new Date(e.endDate).getMonth() + 1}/${new Date(e.endDate).getDate()})`}
                  </p>
                  {e.description && (
                    <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{e.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {e.participants.map((p) => (
                      <span key={p.member.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                        {p.member.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 男気 */}
          {selectedDay.otokogi.map((o) => (
            <div key={o.id} className="bg-white rounded-lg p-3 border shadow-sm">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-amber-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800 text-sm truncate">{o.eventName}</p>
                    <p className="text-sm font-bold text-slate-800 shrink-0">¥{o.amount.toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-gray-500">男気 — {o.payer.name}</p>
                  {o.memo && (
                    <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{o.memo}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 割り勘 */}
          {selectedDay.warikan.map((w) => (
            <Link key={w.id} href={`/warikan/${w.id}`} className="block">
              <div className="bg-white rounded-lg p-3 border shadow-sm hover:border-amber-300 transition">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-sky-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm truncate">{w.eventName}</p>
                    <p className="text-xs text-gray-500">割り勘 — {w.manager?.name ?? '未設定'}</p>
                    {w.memo && (
                      <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{w.memo}</p>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
