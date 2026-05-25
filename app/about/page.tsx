import Link from "next/link";
import { ArrowLeft, Globe2, HeartHandshake, Sparkles, Send } from "lucide-react";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            About Hyper to Be Free
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
            A place for testimonies, praise reports, prayer, and stories of freedom.
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            Hyper to Be Free is a faith-centered space where people from around
            the world can share testimonies, praise reports, prayer
            encouragement, and stories of what God, Jesus, and the Holy Spirit
            are doing in their lives.
          </p>

          <div className="mt-10 grid gap-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <HeartHandshake className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  The heart behind it
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                Hyper to Be Free was inspired by a dream of a website filled
                with people from all over the world sharing the good things God
                had done in their lives. The vision was simple: a place where
                someone could come feeling low, discouraged, or weighed down and
                immediately see hope through real stories of God moving in
                people’s lives.
              </p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <Globe2 className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  Stories from around the world
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                The goal is to bring together stories from different countries,
                communities, and backgrounds so visitors can see testimonies,
                praise reports, answered prayers, and encouragement from people
                around the world.
              </p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  Why it exists
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                Hyper to Be Free exists to help people see and share moments of
                hope, healing, restoration, peace, answered prayer, and freedom.
                Every story has the potential to encourage someone else.
              </p>
            </section>
          </div>

          <div className="mt-10 rounded-3xl bg-[#082f63] p-6 text-white">
            <h2 className="text-2xl font-black">Share what God has done</h2>
            <p className="mt-3 leading-7 text-blue-100">
              Whether the story is big or small, recent or years in the making,
              it may be the encouragement someone else needs today.
            </p>

            <Link
              href="/share-your-story"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-blue-50"
            >
              Share Your Story <Send className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
