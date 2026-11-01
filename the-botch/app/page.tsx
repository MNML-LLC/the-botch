// 5分間のISRキャッシュ（集計値は即時性不要）
export const revalidate = 300;

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { MEMBER_SELECT } from '@/lib/prisma-selects';
import { EVENT_TYPE_LABELS, WARIKAN_STATUS_LABELS } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Yen } from '@/components/ui/yen';
import { formatDateBoth } from '@/lib/date-utils';
import MonthlySummaryCollapsible from './(dashboard)/monthly-summary-collapsible';

const EVENT_TYPE_COLORS: Record<string, string> = {
  TRIP: 'bg-blue-100 text-blue-700',
  HANGOUT: 'bg-green-100 text-green-700',
  ACTIVITY: 'bg-purple-100 text-purple-700',
  OTHER: 'bg-gray-100 text-gray-600',
};


function formatShortDate(date: Date | string | null) {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysUntil(target: Date, from: Date): number {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

async function fetchDashboardData() {
  // ビルド時 (next build の静的 prerender) は DB を叩かない。
  if (process.env.NEXT_PHASE === 'phase-production-build' && !process.env.E2E_CI) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [
    openWarikan,
    upcomingEvents,
    monthlyOtokogi,
    monthlyStats,
  ] = await Promise.all([
    // A: 未精算の割り勘イベント（ENTERING / PAYING）
    prisma.warikanEvent.findMany({
      where: { status: { not: 'CLOSED' } },
      select: {
        id: true,
        eventName: true,
        status: true,
        paymentDeadline: true,
        detailDeadline: true,
        manager: { select: MEMBER_SELECT },
        _count: { select: { participants: true } },
      },
      orderBy: [
        { paymentDeadline: 'asc' },
        { detailDeadline: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 10,
    }),

    // C: 来週(未来7日以内)のイベント max 3
    prisma.event.findMany({
      where: {
        date: { gte: today, lte: nextWeek },
      },
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

    // D: 今月の男気 Top 3
    prisma.$queryRaw<{ payerId: string; total: bigint; count: bigint }[]>`
      SELECT payer_id AS "payerId",
             SUM(amount)::bigint AS total,
             COUNT(*)::bigint AS count
      FROM otokogi_events
      WHERE event_date >= ${monthStart} AND event_date < ${nextMonthStart}
      GROUP BY payer_id
      ORDER BY total DESC
      LIMIT 3
    `,

    // E: 今月サマリ（男気 + 割り勘立替）
    prisma.$queryRaw<{ otokogi_count: bigint; otokogi_total: bigint; warikan_count: bigint; warikan_total: bigint }[]>`
      SELECT
        COALESCE((SELECT COUNT(*) FROM otokogi_events WHERE event_date >= ${monthStart} AND event_date < ${nextMonthStart}), 0)::bigint AS otokogi_count,
        COALESCE((SELECT SUM(amount) FROM otokogi_events WHERE event_date >= ${monthStart} AND event_date < ${nextMonthStart}), 0)::bigint AS otokogi_total,
        COALESCE((SELECT COUNT(DISTINCT we.id) FROM warikan_events we JOIN warikan_expenses ex ON we.id = ex.warikan_event_id WHERE COALESCE(we.display_date, we.created_at::date) >= ${monthStart} AND COALESCE(we.display_date, we.created_at::date) < ${nextMonthStart}), 0)::bigint AS warikan_count,
        COALESCE((SELECT SUM(ex.amount) FROM warikan_events we JOIN warikan_expenses ex ON we.id = ex.warikan_event_id WHERE COALESCE(we.display_date, we.created_at::date) >= ${monthStart} AND COALESCE(we.display_date, we.created_at::date) < ${nextMonthStart}), 0)::bigint AS warikan_total
    `,
  ]);

  // 男気 Top 3 のメンバー情報取得
  const topPayerIds = monthlyOtokogi.map((r) => r.payerId);
  const topPayers = topPayerIds.length
    ? await prisma.member.findMany({
        where: { id: { in: topPayerIds } },
        select: MEMBER_SELECT,
      })
    : [];
  const topPayerMap = new Map(topPayers.map((m) => [m.id, m]));
  const otokogiTop = monthlyOtokogi
    .map((r) => {
      const m = topPayerMap.get(r.payerId);
      if (!m) return null;
      return {
        member: m,
        total: Number(r.total),
        count: Number(r.count),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const stats = monthlyStats[0] ?? {
    otokogi_count: BigInt(0),
    otokogi_total: BigInt(0),
    warikan_count: BigInt(0),
    warikan_total: BigInt(0),
  };

  const summary = {
    otokogiCount: Number(stats.otokogi_count),
    otokogiTotal: Number(stats.otokogi_total),
    warikanCount: Number(stats.warikan_count),
    warikanTotal: Number(stats.warikan_total),
    monthLabel: `${today.getFullYear()}年${today.getMonth() + 1}月`,
  };

  return { openWarikan, upcomingEvents, otokogiTop, summary, today };
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

  const { openWarikan, upcomingEvents, otokogiTop, summary, today } = data;

  return (
    <div className="grid gap-4">
      {/* A. 🔴 要アクション (未精算) */}
      <Card data-section="action-required">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <span aria-hidden>🔴</span>
              要アクション
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 min-h-[44px] px-3">
              <Link href="/warikan">全て →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {openWarikan.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 p-3">
              <span className="text-base" aria-hidden>✅</span>
              <p className="text-sm text-green-700 font-medium">全部精算済み</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openWarikan.map((w) => {
                const deadline = w.paymentDeadline ?? w.detailDeadline;
                const diff = deadline ? daysUntil(new Date(deadline), today) : null;
                const over = diff !== null && diff < 0;
                const near = diff !== null && diff >= 0 && diff <= 3;
                const bg = over
                  ? 'border-red-200 bg-red-50 hover:border-red-300'
                  : near
                    ? 'border-amber-200 bg-amber-50 hover:border-amber-300'
                    : 'border-gray-200 bg-white hover:border-slate-300';
                const dateText = deadline ? `期限: ${formatShortDate(deadline)}` : '期限未設定';
                const diffText = diff === null
                  ? ''
                  : over
                    ? `(${Math.abs(diff)}日超過)`
                    : diff === 0
                      ? '(今日)'
                      : `(あと${diff}日)`;
                return (
                  <Link
                    key={w.id}
                    href={`/warikan/${w.id}`}
                    className={`block rounded-md border p-3 transition ${bg}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{w.eventName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {w._count.participants}人 / 幹事: {w.manager?.name ?? '未設定'}
                        </p>
                        <p className={`text-xs mt-1 ${over ? 'text-red-600 font-medium' : near ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                          {dateText} {diffText}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${w.status === 'ENTERING' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {WARIKAN_STATUS_LABELS[w.status]}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {w.status === 'ENTERING' ? '入力へ' : '払う'} →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* B. 🟡 承認待ち / 要確認 */}
      <Card data-section="approval-pending">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800 flex items-center gap-2">
            <span aria-hidden>🟡</span>
            承認待ち / 要確認
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-gray-500">現在、承認待ちの申請はありません</p>
        </CardContent>
      </Card>

      {/* C. 📅 来週のイベント (max 3件) */}
      <Card data-section="upcoming-events">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <span aria-hidden>📅</span>
              来週のイベント
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 min-h-[44px] px-3">
              <Link href="/calendar">カレンダー →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-500">7日以内の予定はありません</p>
          ) : (
            <div className="space-y-1">
              {upcomingEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}`}
                  className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 transition group"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs text-amber-600 font-medium shrink-0 tabular-nums">
                    {formatDateBoth(ev.date)}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* D. 🏆 今月の男気 Top 3 */}
      <Card data-section="otokogi-top3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <span aria-hidden>🏆</span>
              今月の男気 Top 3
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 min-h-[44px] px-3">
              <Link href="/otokogi/stats">全部見る →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {otokogiTop.length === 0 ? (
            <p className="text-sm text-gray-500">今月の男気はまだありません</p>
          ) : (
            <div className="space-y-2">
              {otokogiTop.map((row, idx) => {
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div
                    key={row.member.id}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg bg-gradient-to-r from-amber-50 to-transparent border border-amber-100"
                  >
                    <span className="text-xl shrink-0" aria-label={`${idx + 1}位`}>
                      {medals[idx] ?? `${idx + 1}位`}
                    </span>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${row.member.colorBg} ${row.member.colorText}`}>
                      {row.member.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{row.member.name}</p>
                      <p className="text-[10px] text-gray-500">{row.count}回</p>
                    </div>
                    <Yen value={row.total} size="sm" className="font-bold text-slate-800 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* E. 📊 今月サマリ (折りたたみ) */}
      <MonthlySummaryCollapsible
        monthLabel={summary.monthLabel}
        otokogiCount={summary.otokogiCount}
        otokogiTotal={summary.otokogiTotal}
        warikanCount={summary.warikanCount}
        warikanTotal={summary.warikanTotal}
      />
    </div>
  );
}
