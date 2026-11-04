"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

export const CREATE_LINKS = [
  { href: '/otokogi/new', label: '🥇 男気を記録', description: 'じゃんけん後の支払いを記録' },
  { href: '/warikan/new', label: '💰 割り勘を立てる', description: 'イベントの立替・精算' },
  { href: '/calendar/new', label: '📅 イベントを追加', description: 'カレンダーに予定を追加' },
];

type CreateSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateSheet({ open, onClose }: CreateSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 pb-[max(env(safe-area-inset-bottom),2rem)] sm:pb-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="create-sheet-title" className="text-base font-bold text-slate-800">
            作成
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
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
                onClick={onClose}
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
  );
}
