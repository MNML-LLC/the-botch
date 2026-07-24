"use client";
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'ダッシュボード', href: '/' },
  { name: 'カレンダー', href: '/calendar' },
  { name: '割り勘管理', href: '/warikan' },
  { name: '男気管理', href: '/otokogi' },
  { name: 'メンバー管理', href: '/members' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  // ナビゲーションリンクのホバー時にデータをprefetch
  const handlePrefetch = useCallback((href: string) => {
    if (href === '/warikan') {
      queryClient.prefetchInfiniteQuery({
        queryKey: ['warikan', 'all', 'all'],
        queryFn: async () => {
          const res = await fetch('/api/warikan');
          if (!res.ok) throw new Error('prefetch failed');
          return res.json();
        },
        initialPageParam: null,
      });
    } else if (href === '/members') {
      queryClient.prefetchQuery({
        queryKey: ['members'],
        queryFn: async () => {
          const res = await fetch('/api/members');
          if (!res.ok) throw new Error('prefetch failed');
          return res.json();
        },
      });
    }
  }, [queryClient]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="bg-slate-800 shadow-lg sticky top-0 z-50">
      <nav className="max-w-lg mx-auto px-4" aria-label="Top">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <span className="text-lg font-bold text-white tracking-tight">The botch</span>
            </Link>
          </div>
          <div className="hidden md:flex gap-1 text-sm">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onMouseEnter={() => handlePrefetch(item.href)}
                className={cn(
                  isActive(item.href)
                    ? 'text-amber-400 border-b-2 border-amber-400'
                    : 'text-gray-300 hover:text-white',
                  'px-3 py-1 font-medium'
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>
          <div className="md:hidden">
            <button
              type="button"
              className="p-2 rounded-md text-gray-300 hover:text-white hover:bg-slate-700"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="sr-only">メニューを開く</span>
              {mobileMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* モバイルメニュー */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-700">
          <div className="max-w-lg mx-auto px-2 pt-2 pb-3 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  isActive(item.href)
                    ? 'bg-slate-600 text-amber-400'
                    : 'text-gray-300 hover:bg-slate-600 hover:text-white',
                  'block px-3 py-2 rounded-md text-base font-medium'
                )}
                onTouchStart={() => handlePrefetch(item.href)}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
