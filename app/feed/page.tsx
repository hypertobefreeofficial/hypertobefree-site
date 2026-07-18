import FreedomFeed from "../../components/FreedomFeed";
import FeedScrollHeader from "../../components/FeedScrollHeader";

export default function FeedPage() {
  return (
    <main className="feed-page min-h-screen bg-white text-slate-900 md:bg-[#f3f7fc]">
      <FeedScrollHeader>
        <div className="app-desktop-shell-inner flex h-[var(--app-feed-sticky-header-height)] items-center justify-between lg:hidden">
          <div className="text-sm font-black text-[#082f63]">HTBF</div>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Feed
          </div>

          <div className="w-10" aria-hidden />
        </div>
      </FeedScrollHeader>

      <FreedomFeed />
    </main>
  );
}
