"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { CreateSheet } from '@/components/ui/create-sheet';

const VISIBLE_PREFIXES = [
  '/',
  '/otokogi',
  '/warikan',
  '/calendar',
  '/timeline',
  '/members',
];

function shouldShowFab(pathname: string | null): boolean {
  if (!pathname) return false;
  // Hide while user is creating something (/*/new)
  if (pathname === '/new' || pathname.endsWith('/new') || pathname.includes('/new/')) return false;

  if (pathname === '/') return true;
  return VISIBLE_PREFIXES.some((prefix) => {
    if (prefix === '/') return false;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export default function Fab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!shouldShowFab(pathname)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="作成"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-4 z-40 w-14 h-14 rounded-full bg-amber-700 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
      <CreateSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
