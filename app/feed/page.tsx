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

      <div className="feed-brand-shell mx-auto max-w-4xl px-4 py-6">
        <style>{`
          .feed-brand-shell a[href="/share-your-story"][class*="min-h-12"][class*="rounded-full"] {
            overflow: hidden;
            background-color: #dbeafe !important;
            background-image:
              linear-gradient(90deg, rgba(239, 248, 255, 0.96), rgba(191, 219, 254, 0.82)),
              url("/images/hero-freedom.png");
            background-position: center, center;
            background-repeat: no-repeat, repeat;
            background-size: cover, 8.5rem auto;
            color: #062a57 !important;
            box-shadow: inset 0 0 0 1px rgba(11, 99, 206, 0.12);
            text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
          }

          .feed-brand-shell a[href="/share-your-story"][class*="min-h-12"][class*="rounded-full"]:hover {
            background-color: #bfdbfe !important;
            background-image:
              linear-gradient(90deg, rgba(224, 242, 254, 0.95), rgba(147, 197, 253, 0.78)),
              url("/images/hero-freedom.png");
          }
        `}</style>
        <FreedomFeed />
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
