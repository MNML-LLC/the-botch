// Prisma を各リクエストで直叩き。SSG prerender させず、ビルド時 dummy DATABASE_URL での
// Prisma hang / snapshot null を物理的に発生させない (Issue #353)
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { MEMBER_SELECT } from '@/lib/prisma-selects';
import { EVENT_TYPE_LABELS } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Yen } from '@/components/ui/yen';
import { formatDateBoth, getFiscalYearRange } from '@/lib/date-utils';
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

type DeadlineTone = 'over' | 'near' | 'safe' | 'none';

function deadlineTone(diff: number | null): DeadlineTone {
  if (diff === null) return 'none';
  if (diff < 0) return 'over';
  if (diff <= 3) return 'near';
  return 'safe';
}

async function fetchDashboardData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  // 「今期」は会計年度 (11/1 - 翌 10/31) を /otokogi/stats と揃える (Issue #382)
  const fy = getFiscalYearRange(today, 0);
  const yearStart = fy.from;
  const nextYearStart = new Date(fy.to.getTime() + 1);

  const [
    openWarikan,
    upcomingEvents,
    yearlyOtokogi,
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

    // D: 今期(年初来)の男気 Top 3
    prisma.$queryRaw<{ payerId: string; total: bigint; count: bigint }[]>`
      SELECT payer_id AS "payerId",
             SUM(amount)::bigint AS total,
             COUNT(*)::bigint AS count
      FROM otokogi_events
      WHERE event_date >= ${yearStart} AND event_date < ${nextYearStart}
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

  // 未精算の金額を割り勘ごとに集計:
  //  - ENTERING: 立替明細の合計（これから分割される原資）
  //  - PAYING: 未受領の精算合計（まだ動いていないお金）
  const enteringIds = openWarikan.filter((w) => w.status === 'ENTERING').map((w) => w.id);
  const payingIds = openWarikan.filter((w) => w.status === 'PAYING').map((w) => w.id);

  const [enteringSums, payingSums] = await Promise.all([
    enteringIds.length
      ? prisma.warikanExpense.groupBy({
          by: ['warikanEventId'],
          where: { warikanEventId: { in: enteringIds } },
          _sum: { amount: true },
        })
      : Promise.resolve([] as { warikanEventId: string; _sum: { amount: number | null } }[]),
    payingIds.length
      ? prisma.warikanSettlement.groupBy({
          by: ['warikanEventId'],
          where: { warikanEventId: { in: payingIds }, isReceived: false },
          _sum: { amount: true },
        })
      : Promise.resolve([] as { warikanEventId: string; _sum: { amount: number | null } }[]),
  ]);

  const amountMap = new Map<string, number>();
  for (const r of enteringSums) amountMap.set(r.warikanEventId, Number(r._sum.amount ?? 0));
  for (const r of payingSums) amountMap.set(r.warikanEventId, Number(r._sum.amount ?? 0));

  const openWarikanWithAmount = openWarikan.map((w) => ({
    ...w,
    pendingAmount: amountMap.get(w.id) ?? 0,
  }));

  // 男気 Top 3 のメンバー情報取得
  const topPayerIds = yearlyOtokogi.map((r) => r.payerId);
  const topPayers = topPayerIds.length
    ? await prisma.member.findMany({
        where: { id: { in: topPayerIds } },
        select: MEMBER_SELECT,
      })
    : [];
  const topPayerMap = new Map(topPayers.map((m) => [m.id, m]));
  const otokogiTop = yearlyOtokogi
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

  return {
    openWarikan: openWarikanWithAmount,
    upcomingEvents,
    otokogiTop,
    summary,
    today,
    yearLabel: `${fy.fy}年度`,
  };
}

export default async function DashboardPage() {
  const { openWarikan, upcomingEvents, otokogiTop, summary, today, yearLabel } = await fetchDashboardData();

  const [hero, ...rest] = openWarikan;
  const heroDeadline = hero ? hero.paymentDeadline ?? hero.detailDeadline : null;
  const heroDiff = heroDeadline ? daysUntil(new Date(heroDeadline), today) : null;
  const heroTone = deadlineTone(heroDiff);

  const HERO_TONE_STYLES: Record<DeadlineTone, { card: string; chip: string; amount: string; label: string }> = {
    over: {
      card: 'border-red-200 bg-gradient-to-br from-red-50 to-white',
      chip: 'bg-red-100 text-red-700',
      amount: 'text-red-700',
      label: '期限超過',
    },
    near: {
      card: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
      chip: 'bg-amber-100 text-amber-700',
      amount: 'text-amber-700',
      label: '期限間近',
    },
    safe: {
      card: 'border-slate-200 bg-gradient-to-br from-slate-50 to-white',
      chip: 'bg-slate-100 text-slate-700',
      amount: 'text-slate-800',
      label: '余裕あり',
    },
    none: {
      card: 'border-slate-200 bg-gradient-to-br from-slate-50 to-white',
      chip: 'bg-slate-100 text-slate-600',
      amount: 'text-slate-800',
      label: '期限未設定',
    },
  };

  return (
    <div className="grid gap-4">
      {/* 🔴 要アクション（未精算ヒーロー） */}
      <section data-section="action-required" aria-labelledby="action-required-heading">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 id="action-required-heading" className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <span aria-hidden>🔴</span>
            要アクション
          </h2>
          {hero && (
            <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 h-auto py-1 px-2">
              <Link href="/warikan">全て →</Link>
            </Button>
          )}
        </div>

        {!hero ? (
          <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
            <CardContent className="py-10 text-center">
              <div className="text-4xl mb-2" aria-hidden>🎉</div>
              <p className="text-base font-bold text-green-700">全部精算済み</p>
              <p className="text-xs text-green-600 mt-1">未精算の割り勘はありません</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Hero: 画面の約 40% を占める大カード */}
            <Link
              href={`/warikan/${hero.id}`}
              className={`block rounded-xl border-2 p-5 transition shadow-sm hover:shadow active:scale-[0.99] ${HERO_TONE_STYLES[heroTone].card}`}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${HERO_TONE_STYLES[heroTone].chip}`}
                >
                  {heroDiff === null
                    ? HERO_TONE_STYLES[heroTone].label
                    : heroTone === 'over'
                      ? `${Math.abs(heroDiff)}日超過`
                      : heroDiff === 0
                        ? '今日が期限'
                        : `あと${heroDiff}日`}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${hero.status === 'ENTERING' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}
                >
                  {hero.status === 'ENTERING' ? '明細入力中' : '支払待ち'}
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-900 leading-snug line-clamp-2 mb-1">
                {hero.eventName}
              </h3>
              <p className="text-xs text-gray-600 mb-4">
                {hero._count.participants}人 / 幹事: {hero.manager?.name ?? '未設定'}
                {heroDeadline && <> ・ 期限: {formatShortDate(heroDeadline)}</>}
              </p>

              <div className="mb-5">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">
                  {hero.status === 'ENTERING' ? '立替合計' : '未精算残額'}
                </p>
                <div className={`font-bold ${HERO_TONE_STYLES[heroTone].amount}`}>
                  <Yen value={hero.pendingAmount} size="xl" className="text-4xl sm:text-5xl tracking-tight" />
                </div>
              </div>

              {/* CTA: Thumb-first で下 1/3 に配置 */}
              <div className="grid grid-cols-2 gap-2">
                <span className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm">
                  {hero.status === 'ENTERING' ? '明細入力 →' : '払う →'}
                </span>
                <span className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  {hero.status === 'ENTERING' ? '精算開始' : '払ったことにする'}
                </span>
              </div>
            </Link>

            {/* 他の未精算（折りたたみ） */}
            {rest.length > 0 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer text-xs text-gray-600 py-2 px-3 rounded-md bg-gray-50 hover:bg-gray-100 inline-flex items-center gap-1 list-none">
                  <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                  他 {rest.length} 件
                </summary>
                <div className="mt-2 space-y-2">
                  {rest.map((w) => {
                    const deadline = w.paymentDeadline ?? w.detailDeadline;
                    const diff = deadline ? daysUntil(new Date(deadline), today) : null;
                    const tone = deadlineTone(diff);
                    const bg =
                      tone === 'over'
                        ? 'border-red-200 bg-red-50'
                        : tone === 'near'
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-gray-200 bg-white';
                    const diffText =
                      diff === null
                        ? '期限未設定'
                        : tone === 'over'
                          ? `${Math.abs(diff)}日超過`
                          : diff === 0
                            ? '今日'
                            : `あと${diff}日`;
                    return (
                      <Link
                        key={w.id}
                        href={`/warikan/${w.id}`}
                        className={`block rounded-md border p-3 transition hover:border-slate-300 ${bg}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 break-words line-clamp-2 leading-tight">{w.eventName}</p>
                            <p className={`text-xs mt-0.5 ${tone === 'over' ? 'text-red-600 font-medium' : tone === 'near' ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                              {diffText} ・ {w.status === 'ENTERING' ? '明細入力中' : '支払待ち'}
                            </p>
                          </div>
                          <Yen value={w.pendingAmount} size="sm" className="font-bold text-slate-700 shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {/* 🟡 来週のイベント */}
      <Card data-section="upcoming-events">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <span aria-hidden>🟡</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {upcomingEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}`}
                  className="flex flex-col gap-1.5 rounded-lg border border-amber-100 bg-amber-50/50 p-3 hover:bg-amber-50 hover:border-amber-200 transition min-w-0"
                >
                  <span className="text-xs text-amber-700 font-semibold tabular-nums">
                    {formatDateBoth(ev.date)}
                  </span>
                  <span className="text-sm font-medium text-slate-800 break-words line-clamp-2 leading-tight">
                    {ev.title}
                  </span>
                  <div className="flex items-center justify-between gap-1 mt-auto">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${EVENT_TYPE_COLORS[ev.eventType] ?? EVENT_TYPE_COLORS.OTHER}`}>
                      {EVENT_TYPE_LABELS[ev.eventType] ?? 'その他'}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {ev._count.participants}人
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 🏆 今期の男気 Top 3 */}
      <Card data-section="otokogi-top3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <span aria-hidden>🏆</span>
              今期の男気 Top 3
              <span className="text-xs text-gray-400 font-normal">（{yearLabel}）</span>
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-gray-500 min-h-[44px] px-3">
              <Link href="/otokogi/stats">全部見る →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {otokogiTop.length === 0 ? (
            <p className="text-sm text-gray-500">今期の男気はまだありません</p>
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
                      <p className="text-sm font-medium text-slate-800 break-words line-clamp-2 leading-tight">{row.member.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{row.count}回</p>
                    </div>
                    <Yen value={row.total} size="sm" className="font-bold text-slate-800 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 📊 今月サマリ (折りたたみ) */}
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
