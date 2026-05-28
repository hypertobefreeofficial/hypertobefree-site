import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FreedomFeed from "../../components/FreedomFeed";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

export default function VideosPage() {
  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Feed
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Videos
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Video Testimonies
          </div>
          <h1 className="mt-2 text-4xl font-black text-[#062a57]">
            Reels of hope
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Watch video testimonies, praise reports, and stories shared by the
            HTBF community.
          </p>
        </div>

        <FreedomFeed />
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
