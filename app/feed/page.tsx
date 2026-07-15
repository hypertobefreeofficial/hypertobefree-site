import FreedomFeed from "../../components/FreedomFeed";

export default function FeedPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900 md:bg-[#f3f7fc]">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/95 backdrop-blur-xl supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-3 md:py-3.5">
          <div className="text-sm font-black text-[#082f63]">HTBF</div>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Feed
          </div>
        </div>
      </header>

      <FreedomFeed />
    </main>
  );
}
