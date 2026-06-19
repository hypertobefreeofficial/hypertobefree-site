import FreedomFeed from "../../components/FreedomFeed";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

export default function FeedPage() {
  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="text-sm font-black text-[#082f63]">HTBF</div>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Feed
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-4xl px-4 py-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-8 top-[4.6rem] z-10 h-24 w-24 overflow-hidden rounded-[1.5rem] opacity-15 sm:right-16 sm:top-20 sm:h-32 sm:w-32 md:right-20"
        >
          <img
            src="/images/hero-freedom.png"
            alt=""
            className="h-full w-full object-contain object-right"
          />
        </div>

        <FreedomFeed />
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
