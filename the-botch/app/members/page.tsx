"use client";

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';
import { useMembers } from '@/hooks/use-members';

function MembersListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-8 w-12" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MembersPage() {
  const { data: members = [], isLoading: loading } = useMembers({
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
        <MembersListSkeleton />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="メンバーがいません"
          description="最初のメンバーを追加してみましょう"
          action={{ label: '+ 追加', href: '/members/new' }}
        />
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/members/${member.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-gray-50 transition"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${member.colorBg} ${member.colorText}`}>
                      {member.initial}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{member.name}</p>
                      <p className="text-xs text-gray-500 truncate">{member.fullName}</p>
                      {member.paypayId && (
                        <p className="text-xs text-red-500 font-mono mt-0.5 truncate">@{member.paypayId}</p>
                      )}
                      {member.bankAccount && (
                        <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium mt-0.5">口座登録済</span>
                      )}
                    </div>
                  </Link>
                  <Button variant="outline" size="sm" asChild className="shrink-0">
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
