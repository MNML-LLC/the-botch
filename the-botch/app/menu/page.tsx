import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'メニュー | The botch',
};

type MenuLink = {
  href: string;
  icon: string;
  label: string;
  description: string;
};

const SECTIONS: Array<{ title: string; links: MenuLink[] }> = [
  {
    title: '記録・管理',
    links: [
      { href: '/warikan', icon: '💰', label: '割り勘管理', description: '立替・精算の管理' },
      { href: '/otokogi', icon: '🥇', label: '男気管理', description: '男気の履歴・ランキング' },
      { href: '/calendar', icon: '📅', label: 'カレンダー', description: 'イベントスケジュール' },
      { href: '/members', icon: '👥', label: 'メンバー管理', description: 'プロフィール・銀行口座' },
    ],
  },
  {
    title: '統計・分析',
    links: [
      { href: '/otokogi?tab=stats', icon: '📊', label: '男気統計', description: 'メンバー別・月次推移' },
      { href: '/warikan/summary', icon: '📈', label: '割り勘サマリ', description: 'メンバー間収支' },
    ],
  },
  {
    title: 'クイック作成',
    links: [
      { href: '/otokogi/new', icon: '➕', label: '男気を記録', description: '新しい男気を追加' },
      { href: '/warikan/new', icon: '➕', label: '割り勘を作成', description: '新しい割り勘を開始' },
      { href: '/calendar/new', icon: '➕', label: 'イベントを追加', description: '新しい予定を追加' },
      { href: '/warikan/import', icon: '📥', label: 'Walica インポート', description: 'Walica からデータ取込' },
    ],
  },
];

export default function MenuPage() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span aria-hidden>☰</span>
          メニュー
        </h1>
      </div>
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-gray-600">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="grid gap-1">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition"
                  >
                    <span className="text-xl shrink-0" aria-hidden>
                      {link.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{link.label}</p>
                      <p className="text-xs text-gray-500">{link.description}</p>
                    </div>
                    <span className="text-gray-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
