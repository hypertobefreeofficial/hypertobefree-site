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
          .feed-brand-shell > section > div > div:first-child {
            isolation: isolate;
            position: relative;
            overflow: hidden;
            background:
              linear-gradient(115deg, rgba(255, 255, 255, 0.93), rgba(147, 197, 253, 0.62)),
              #dbeafe !important;
            box-shadow: inset 0 0 0 1px rgba(11, 99, 206, 0.12);
          }

          .feed-brand-shell > section > div > div:first-child::before {
            content: "";
            position: absolute;
            inset: -20% -4% -20% 28%;
            z-index: 0;
            background-image: url("/images/hero-freedom.png");
            background-position: center;
            background-repeat: no-repeat;
            background-size: contain;
            filter: saturate(1.45) contrast(1.18) drop-shadow(0 22px 34px rgba(8, 47, 99, 0.2));
            opacity: 0.68;
            pointer-events: none;
          }

          .feed-brand-shell > section > div > div:first-child::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: 0;
            background:
              radial-gradient(circle at 76% 42%, rgba(11, 99, 206, 0.34), transparent 40%),
              linear-gradient(90deg, rgba(255, 255, 255, 0.92) 0%, rgba(239, 248, 255, 0.78) 48%, rgba(37, 99, 235, 0.12) 100%);
            pointer-events: none;
          }

          .feed-brand-shell > section > div > div:first-child > * {
            position: relative;
            z-index: 1;
          }

          .feed-brand-shell a[href="/share-your-story"][class*="min-h-12"][class*="rounded-full"] {
            overflow: visible;
            background-color: rgb(241 245 249) !important;
            background-image: none !important;
            color: rgb(100 116 139) !important;
            box-shadow: none;
            text-shadow: none;
          }

          .feed-brand-shell a[href="/share-your-story"][class*="min-h-12"][class*="rounded-full"]:hover {
            background-color: rgb(226 232 240) !important;
          }

          @media (max-width: 640px) {
            .feed-brand-shell > section > div > div:first-child::before {
              inset: -10% -28% -16% 16%;
              opacity: 0.56;
            }
          }
        `}</style>
        <FreedomFeed />
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
