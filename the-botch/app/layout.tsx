import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/layout/Header';
import Providers from './providers';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'The botch',
  description: '割り勘・男気管理アプリ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <body className={cn(inter.className, "h-full bg-gray-50")}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-grow max-w-lg mx-auto w-full px-4 py-4">
              {children}
            </main>
            <footer className="border-t border-gray-200 py-6">
              <div className="max-w-lg mx-auto px-4 text-center text-sm text-gray-500">
                © {new Date().getFullYear()} The botch
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
