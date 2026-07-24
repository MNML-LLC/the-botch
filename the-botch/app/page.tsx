// 5分間のISRキャッシュ（集計値は即時性不要）
export const revalidate = 300;

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { MEMBER_SELECT } from '@/lib/prisma-selects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import MonthlyTrendChart from './monthly-trend-chart';
import type { MonthlyTrendData } from './monthly-trend-chart';

const EVENT_TYPE_LABELS: Record<string, string> = {
  TRIP: '旅行',
  HANGOUT: '飲み会',
  ACTIVITY: 'アクティビティ',
  OTHER: 'その他',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  TRIP: 'bg-blue-100 text-blue-700',
  HANGOUT: 'bg-green-100 text-green-700',
  ACTIVITY: 'bg-purple-100 text-purple-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

function formatEventDate(date: Date | string): string {
  const d = new Date(date);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
}

function formatShortDate(date: Date | string | null) {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'ENTERING':
      return <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">入力中</span>;
    case 'PAYING':
      return <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">支払待ち</span>;
    default:
      return null;
  }
}

async function fetchDashboardData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1);

  const [
    upcomingEvents,
    pastEvents,
    openWarikan,
    recentOtokogi,
    otokogiMonthly,
    warikanMonthly,
  ] = await Promise.all([
    // 未来イベント3件（近い順）
    prisma.event.findMany({
      where: { date: { gte: today } },
      select: {
        id: true,
        title: true,
        date: true,
        eventType: true,
        _count: { select: { participants: true } },
      },
      orderBy: { date: 'asc' },
      take: 3,
    }),

    // 過去イベント3件（新しい順）
    prisma.event.findMany({
      where: { date: { lt: today } },
      select: {
        id: true,
        title: true,
        date: true,
        eventType: true,
        _count: { select: { participants: true } },
      },
      orderBy: { date: 'desc' },
      take: 3,
    }),

    // 未精算割り勘
    prisma.warikanEvent.findMany({
      where: { status: { not: 'CLOSED' } },
      select: {
        id: true,
        eventName: true,
        status: true,
        paymentDeadline: true,
        manager: { select: { name: true } },
        participants: { select: { member: { select: { id: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),

    // 直近男気5件
    prisma.otokogiEvent.findMany({
      select: {
        id: true,
        eventDate: true,
        eventName: true,
        amount: true,
        payer: { select: MEMBER_SELECT },
      },
      orderBy: { eventDate: 'desc' },
      take: 5,
    }),

    // 月次男気集計（過去12ヶ月）
    prisma.$queryRaw<{ month: string; amount: bigint }[]>`
      SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, SUM(amount)::bigint AS amount
      FROM otokogi_events
      WHERE event_date >= ${twelveMonthsAgo}
      GROUP BY month ORDER BY month ASC
    `,

    // 月次割り勘集計（立替明細ベース、過去12ヶ月）
    prisma.$queryRaw<{ month: string; amount: bigint }[]>`
      SELECT TO_CHAR(COALESCE(we.display_date, we.created_at::date), 'YYYY-MM') AS month,
             SUM(ex.amount)::bigint AS amount
      FROM warikan_events we
      JOIN warikan_expenses ex ON we.id = ex.warikan_event_id
      WHERE COALESCE(we.display_date, we.created_at::date) >= ${twelveMonthsAgo}
      GROUP BY month ORDER BY month ASC
    `,
  ]);

  // 12ヶ月グリッド生成（欠損月を0で埋める）
  const monthGrid: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthGrid.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const otokogiMap = new Map(otokogiMonthly.map((r) => [r.month, Number(r.amount)]));
  const warikanMap = new Map(warikanMonthly.map((r) => [r.month, Number(r.amount)]));
  const monthlyTrend: MonthlyTrendData[] = monthGrid.map((month) => ({
    month,
    otokogi: otokogiMap.get(month) ?? 0,
    warikan: warikanMap.get(month) ?? 0,
  }));

  return { upcomingEvents, pastEvents, openWarikan, recentOtokogi, monthlyTrend };
}

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof fetchDashboardData>> | null = null;

  try {
    data = await fetchDashboardData();
  } catch {
    // DB未接続時
  }

  if (!data) {
    return (
      <div className="grid gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-amber-600">データベース未接続のため、データを表示できません。</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/warikan">割り勘管理</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/otokogi">男気管理</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/members">メンバー管理</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { upcomingEvents, pastEvents, openWarikan, recentOtokogi, monthlyTrend } = data;

  return (
    <div className="grid gap-4">
      {/* 直近イベント */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800">直近イベント</CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 h-7 px-2">
              <Link href="/calendar">カレンダー →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {upcomingEvents.length === 0 && pastEvents.length === 0 ? (
            <p className="text-sm text-gray-500">イベントがありません</p>
          ) : (
            <div className="space-y-1">
              {/* 未来イベント */}
              {upcomingEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/calendar"
                  className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 transition group"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs text-amber-600 font-medium w-16 shrink-0">
                    {formatEventDate(ev.date)}
                  </span>
                  <span className="text-sm font-medium text-slate-800 flex-1 truncate group-hover:text-amber-700">
                    {ev.title}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${EVENT_TYPE_COLORS[ev.eventType] ?? EVENT_TYPE_COLORS.OTHER}`}>
                    {EVENT_TYPE_LABELS[ev.eventType] ?? 'その他'}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {ev._count.participants}人
                  </span>
                </Link>
              ))}

              {/* セパレーター（両方データがある場合） */}
              {upcomingEvents.length > 0 && pastEvents.length > 0 && (
                <div className="border-t border-gray-100 my-1" />
              )}

              {/* 過去イベント */}
              {pastEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/calendar"
                  className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 transition group"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-xs text-gray-400 font-medium w-16 shrink-0">
                    {formatEventDate(ev.date)}
                  </span>
                  <span className="text-sm text-gray-600 flex-1 truncate">
                    {ev.title}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 opacity-60 ${EVENT_TYPE_COLORS[ev.eventType] ?? EVENT_TYPE_COLORS.OTHER}`}>
                    {EVENT_TYPE_LABELS[ev.eventType] ?? 'その他'}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {ev._count.participants}人
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 月次推移（男気＋割り勘 積み上げ棒グラフ） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800">月次推移</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MonthlyTrendChart data={monthlyTrend} />
        </CardContent>
      </Card>

      {/* 未精算割り勘 ＋ 直近男気（SP: 縦スタック / PC: 横2列） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 未精算の割り勘 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-slate-800">未精算の割り勘</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 h-6 px-1.5">
                <Link href="/warikan">全て →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {openWarikan.length === 0 ? (
              <p className="text-xs text-gray-500">未精算なし</p>
            ) : (
              <div className="space-y-2">
                {openWarikan.map((w) => (
                  <Link
                    key={w.id}
                    href={`/warikan/${w.id}`}
                    className="block rounded-md p-2 border hover:border-amber-300 transition bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-medium text-slate-800 truncate flex-1">{w.eventName}</p>
                      {statusBadge(w.status)}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {w.participants.length}人
                      {w.paymentDeadline && ` / 期日: ${formatShortDate(w.paymentDeadline)}`}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 直近の男気 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-slate-800">直近の男気</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 h-6 px-1.5">
                <Link href="/otokogi">全て →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentOtokogi.length === 0 ? (
              <p className="text-xs text-gray-500">まだ記録なし</p>
            ) : (
              <div className="space-y-2">
                {recentOtokogi.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${o.payer.colorBg} ${o.payer.colorText}`}>
                      {o.payer.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{o.eventName}</p>
                      <p className="text-[10px] text-gray-400">{formatShortDate(o.eventDate)} / {o.payer.name}</p>
                    </div>
                    <p className="text-xs font-bold text-slate-800 shrink-0">¥{o.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
