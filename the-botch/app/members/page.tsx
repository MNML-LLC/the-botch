"use client";

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Member = {
  id: string;
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
  paypayId: string | null;
  bankAccount: { id: string } | null;
  isActive: boolean;
};

export default function MembersPage() {
  const { data: members = [], isLoading: loading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await fetch('/api/members');
      if (!res.ok) throw new Error('API error');
      return res.json() as Promise<Member[]>;
    },
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
    gcTime: 10 * 60 * 1000,   // 10分GC
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">メンバー管理</h2>
        <Button asChild className="bg-slate-800 hover:bg-slate-700">
          <Link href="/members/new">+ 追加</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-500">メンバーがいません</p>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${member.colorBg} ${member.colorText}`}>
                      {member.initial}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{member.name}</p>
                      <p className="text-xs text-gray-500">{member.fullName}</p>
                      {member.paypayId && (
                        <p className="text-xs text-red-500 font-mono mt-0.5">@{member.paypayId}</p>
                      )}
                      {member.bankAccount && (
                        <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium mt-0.5">口座登録済</span>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/members/${member.id}/edit`}>編集</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
