import './globals.css';
import Header from '@/components/layout/Header';
import { BottomTabBar } from '@/components/ui/bottom-tab-bar';
import Fab from '@/components/ui/fab';
import Providers from './providers';
import { Toaster } from '@/components/ui/toaster';

export const metadata = {
  title: 'The botch',
  description: '割り勘・男気管理アプリ',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-gray-50 font-sans">
        <Providers>
          <div className="min-h-screen flex flex-col">
            {/* Header はデスクトップのみ表示 (モバイルは BottomTabBar に集約) */}
            <div className="hidden md:block">
              <Header />
            </div>
            {/* モバイルは下部タブの高さぶん padding-bottom を確保 (min-h-[56px] + safe-area) */}
            <main className="flex-grow max-w-lg mx-auto w-full px-4 py-4 pb-20 md:pb-4">
              {children}
            </main>
            <footer className="hidden md:block border-t border-gray-200 py-6">
              <div className="max-w-lg mx-auto px-4 text-center text-sm text-gray-500">
                © {new Date().getFullYear()} The botch
              </div>
            </footer>
          </div>
          <BottomTabBar className="md:hidden" />
          <Fab />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
