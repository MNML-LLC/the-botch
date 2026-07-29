"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useScrollRestorationStore } from '@/lib/scroll-restoration-store';

/**
 * ブラウザバック時のスクロール位置を復元するフック。
 *
 * App Router の非同期データ取得（React Query など）ではブラウザ標準の
 * スクロール復元が働かないことがあるため、`pathname` をキーに Zustand で
 * スクロール位置を保持し、`ready` が true になった直後に一度だけ復元する。
 */
export function useScrollRestoration(ready: boolean) {
  const pathname = usePathname();
  const restoredRef = useRef(false);

  useEffect(() => {
    restoredRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;

    const y = useScrollRestorationStore.getState().getPosition(pathname);
    if (y === undefined || y <= 0) return;

    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  }, [pathname, ready]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        useScrollRestorationStore.getState().savePosition(pathname, window.scrollY);
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      useScrollRestorationStore.getState().savePosition(pathname, window.scrollY);
    };
  }, [pathname]);
}
