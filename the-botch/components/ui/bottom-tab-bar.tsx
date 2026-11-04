"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Waves, Plus, Menu as MenuIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateSheet } from '@/components/ui/create-sheet';

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

type BottomTabBarProps = {
  className?: string;
};

export function BottomTabBar({ className }: BottomTabBarProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <nav
        className={cn(
          'fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/90 backdrop-blur-sm shadow-[0_-1px_3px_rgba(0,0,0,0.05)]',
          'pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        aria-label="メインナビゲーション"
      >
        <ul className="grid grid-cols-4 max-w-lg mx-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            const isCreate = tab.action === 'create';

            if (isCreate) {
              return (
                <li key={tab.key}>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-gray-500"
                    aria-label="作成"
                  >
                    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-700 text-white shadow-sm">
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
                    'flex flex-col items-center justify-center min-h-[56px] gap-1 text-[10px] transition',
                    active
                      ? 'text-amber-700 font-medium'
                      : 'text-gray-500 hover:text-slate-900',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={cn('h-5 w-5', active && 'stroke-[2.25]')} />
                  <span>{tab.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <CreateSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
