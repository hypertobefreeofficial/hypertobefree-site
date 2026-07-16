import FreedomFeed from "../../components/FreedomFeed";

export default function FeedPage() {
  return (
    <main className="feed-page min-h-screen bg-white text-slate-900 md:bg-[#f3f7fc]">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/95 backdrop-blur-xl supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)] lg:top-[var(--app-desktop-nav-height)]">
        <div className="mx-auto flex h-[var(--app-feed-sticky-header-height)] max-w-[760px] items-center justify-between px-4 md:px-5">
          <div className="text-sm font-black text-[#082f63] lg:hidden">HTBF</div>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce] lg:mx-auto">
            Feed
          </div>

          <div className="w-10 lg:hidden" aria-hidden />
        </div>
      </header>

      <FreedomFeed />
    </main>
  );
}
