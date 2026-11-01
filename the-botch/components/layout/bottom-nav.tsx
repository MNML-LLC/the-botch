"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Waves, Plus, Menu as MenuIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = {
  key: string;
  name: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: 'create';
};

const TABS: Tab[] = [
  { key: 'home', name: 'ホーム', href: '/', icon: Home },
  { key: 'timeline', name: 'タイムライン', href: '/timeline', icon: Waves },
  { key: 'create', name: '作成', action: 'create', icon: Plus },
  { key: 'menu', name: 'メニュー', href: '/menu', icon: MenuIcon },
];

const CREATE_LINKS = [
  { href: '/otokogi/new', label: '🥇 男気を記録', description: 'じゃんけん後の支払いを記録' },
  { href: '/warikan/new', label: '💰 割り勘を作成', description: 'イベントの立替・精算' },
  { href: '/calendar/new', label: '📅 イベントを追加', description: 'カレンダーに予定を追加' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]"
        aria-label="メインナビゲーション"
      >
        <ul className="grid grid-cols-4 h-14 max-w-lg mx-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            const isCreate = tab.action === 'create';

            if (isCreate) {
              return (
                <li key={tab.key}>
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-gray-500"
                    aria-label="作成"
                  >
                    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500 text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[10px] text-gray-500">{tab.name}</span>
                  </button>
                </li>
              );
            }

            return (
              <li key={tab.key}>
                <Link
                  href={tab.href!}
                  className={cn(
                    'flex flex-col items-center justify-center h-full gap-1 text-[10px] transition',
                    active
                      ? 'text-amber-600'
                      : 'text-gray-500 hover:text-slate-700'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {modalOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 pb-8 sm:pb-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="create-modal-title" className="text-base font-bold text-slate-800">
                作成
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="space-y-2">
              {CREATE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setModalOpen(false)}
                    className="block rounded-lg border border-gray-200 p-3 hover:border-amber-300 hover:bg-amber-50 transition"
                  >
                    <p className="text-sm font-medium text-slate-800">{link.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{link.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
