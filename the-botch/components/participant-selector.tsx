"use client";

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

export type ParticipantMember = {
  id: string;
  name: string;
  fullName?: string;
};

type Props = {
  label?: string;
  members: ParticipantMember[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onClearAll?: () => void;
  searchPlaceholder?: string;
};

export function ParticipantSelector({
  label = '参加メンバー',
  members,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  searchPlaceholder = '名前で検索...',
}: Props) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const filteredMembers = useMemo(() => {
    if (!normalized) return members;
    return members.filter((m) => {
      const nameHit = m.name.toLowerCase().includes(normalized);
      const fullHit = m.fullName ? m.fullName.toLowerCase().includes(normalized) : false;
      return nameHit || fullHit;
    });
  }, [members, normalized]);

  const selectedCount = selectedIds.length;
  const hiddenSelectedCount = normalized
    ? selectedIds.filter((id) => !filteredMembers.some((m) => m.id === id)).length
    : 0;

  const showActions = Boolean(onSelectAll || onClearAll);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="mb-0">{label}</Label>
        {showActions && (
          <div className="flex gap-2">
            {onSelectAll && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSelectAll}
                disabled={members.length === 0 || selectedCount === members.length}
              >
                全員選択
              </Button>
            )}
            {onClearAll && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClearAll}
                disabled={selectedCount === 0}
              >
                全員解除
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="mb-2 space-y-1">
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="メンバー名で検索"
        />
        {(selectedCount > 0 || normalized) && (
          <p className="text-xs text-gray-500">
            選択中: {selectedCount}人
            {hiddenSelectedCount > 0 && `（うち検索対象外: ${hiddenSelectedCount}人）`}
          </p>
        )}
      </div>
      {filteredMembers.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {filteredMembers.map((m) => {
            const checked = selectedIds.includes(m.id);
            return (
              <label
                key={m.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer ${
                  checked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(m.id)}
                />
                <span className={`text-sm ${checked ? '' : 'text-gray-400'}`}>{m.name}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 py-4 text-center">該当するメンバーがいません</p>
      )}
    </div>
  );
}
