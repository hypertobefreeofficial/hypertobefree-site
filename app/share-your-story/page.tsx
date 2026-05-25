import Link from "next/link";
import { ArrowLeft, Send, ShieldCheck } from "lucide-react";

export default function ShareYourStoryPage() {
  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <Send className="h-4 w-4" />
            Share Your Story
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
            Tell us what God has done in your life.
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            Share a testimony, praise report, prayer encouragement, or story of
            freedom. This first version is a simple draft form while Hyper to Be
            Free continues to grow.
          </p>

          <div className="mt-10 grid gap-6">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Name or first name
              </label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="Example: Ashley"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Location, optional
              </label>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="City, State or Country"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Story type
              </label>
              <select className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white">
                <option>Testimony</option>
                <option>Praise Report</option>
                <option>Prayer Encouragement</option>
                <option>Freedom Story</option>
                <option>Answered Prayer</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Your story
              </label>
              <textarea
                rows={8}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#0b63ce] focus:bg-white"
                placeholder="Share what God has done..."
              />
            </div>

            <label className="flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <input type="checkbox" className="mt-1" />
              <span>
                I understand this is a draft submission form and give Hyper to
                Be Free permission to review my story for possible sharing on
                the website.
              </span>
            </label>

            <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-[#082f63]">
              <div className="mb-1 flex items-center gap-2 font-black">
                <ShieldCheck className="h-4 w-4" />
                Review before posting
              </div>
              Stories submitted here are intended to be reviewed before anything
              is shared publicly.
            </div>

            <button className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-[#084f9f] md:w-fit">
              Submit Story
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
