// LIFF ページ用レイアウト。ヘッダー/フッターを持たない最小構成で
// LINE アプリ内ブラウザから開いた際の見た目を整える。
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[80vh] flex flex-col justify-center">{children}</div>;
}
