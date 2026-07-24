"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

function makeQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1分: イベント系データの更新頻度に合わせた基準値
        // gcTime はデフォルト（5分）を維持
        retry: 1,
      },
    },
  });

  // メンバー一覧は頻繁に変わらないため長めに保持
  queryClient.setQueryDefaults(['members'], { staleTime: 5 * 60 * 1000 });
  // イベント系一覧は更新頻度に合わせて1分
  queryClient.setQueryDefaults(['warikan'], { staleTime: 60 * 1000 });
  queryClient.setQueryDefaults(['otokogi'], { staleTime: 60 * 1000 });

  return queryClient;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
