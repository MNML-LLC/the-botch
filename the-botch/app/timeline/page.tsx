import TimelineFeed from './timeline-feed';

export const metadata = {
  title: 'タイムライン | The botch',
};

export default function TimelinePage() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span aria-hidden>🌊</span>
          タイムライン
        </h1>
      </div>
      <TimelineFeed />
    </div>
  );
}
