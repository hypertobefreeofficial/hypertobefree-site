import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import FreedomFeed from "../../components/FreedomFeed";

export default function AnsweredPrayersPage() {
  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/prayer"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Prayer
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-emerald-700">
            Answered
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Answered Prayers
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            God Did It.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            A place to see prayer requests that were marked answered by the
            person who originally shared them.
          </p>
        </div>

        <FreedomFeed defaultFilter="answered" lockedFilter />
      </div>
    </main>
  );
}
