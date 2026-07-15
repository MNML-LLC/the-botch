"use client";

import { useState } from 'react';
import { maskAccountNumber } from '@/lib/utils';

type MaskedAccountNumberProps = {
  accountNumber: string;
  className?: string;
};

export function MaskedAccountNumber({ accountNumber, className }: MaskedAccountNumberProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードAPIが使えない環境では何もしない
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="font-mono">{revealed ? accountNumber : maskAccountNumber(accountNumber)}</span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="text-[11px] text-blue-500 hover:text-blue-700 underline"
      >
        {revealed ? '隠す' : '全表示'}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="text-[11px] text-gray-400 hover:text-gray-600 underline"
      >
        {copied ? 'コピー済' : 'コピー'}
      </button>
    </span>
  );
}
