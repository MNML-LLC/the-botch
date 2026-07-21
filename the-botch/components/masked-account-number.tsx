"use client";

import { useState } from 'react';
import { maskAccountNumber } from '@/lib/utils';

type MaskedAccountNumberProps = {
  accountNumber: string;
};

/**
 * 口座番号のマスキング表示（末尾4桁のみ）。
 * 「全表示」で一時的に全桁表示、「コピー」は表示状態によらず常に全桁をコピーする。
 * インライン要素のみで構成し、<p> 内でも使用可能。
 */
export function MaskedAccountNumber({ accountNumber }: MaskedAccountNumberProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('コピーに失敗しました');
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">
        {revealed ? accountNumber : maskAccountNumber(accountNumber)}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="text-blue-500 hover:text-blue-600 underline"
      >
        {revealed ? '隠す' : '全表示'}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="text-blue-500 hover:text-blue-600 underline"
      >
        {copied ? 'コピー済' : 'コピー'}
      </button>
    </span>
  );
}
