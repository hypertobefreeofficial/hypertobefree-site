import Link from "next/link";
import FreedomFeed from "../../components/FreedomFeed";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";

export default function PrayerPage() {
  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
       <div className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]">
  HTBF
</div>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Prayer
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Prayer Support
          </div>

          <h1 className="mt-2 text-4xl font-black text-[#062a57]">
            Prayer requests
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Share prayer requests, read what others are asking prayer for, and
            encourage the HTBF community through prayer and support.
          </p>

          <Link
            href="/share-your-story"
            className="mt-6 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
          >
            Share a Prayer Request
          </Link>
        </div>

        <FreedomFeed defaultFilter="prayer" lockedFilter />
      </div>

      <LoggedInBottomNav />
    </main>
  );
}
