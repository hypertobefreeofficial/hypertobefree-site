import Link from "next/link";
import {
  ArrowLeft,
  HeartHandshake,
  ShieldCheck,
  Flag,
  MessageCircleHeart,
} from "lucide-react";

export default function CommunityGuidelinesPage() {
  const guidelines = [
    {
      title: "Share with honesty and care",
      text: "Post testimonies, praise reports, prayer encouragement, and stories in good faith. Your story does not have to be perfect, but it should be sincere.",
    },
    {
      title: "Encourage more than debate",
      text: "Responses should help lift others up. Keep the focus on encouragement, prayer, praise, and what God is doing in people’s lives.",
    },
    {
      title: "Respect people’s privacy",
      text: "Do not share someone else’s name, image, testimony, prayer request, or personal details without their permission.",
    },
    {
      title: "No harassment or personal attacks",
      text: "Do not shame, threaten, mock, bully, or target another person or group.",
    },
    {
      title: "Keep content appropriate",
      text: "Do not post graphic, sexual, exploitative, violent, hateful, or intentionally disturbing content.",
    },
    {
      title: "No scams, spam, or misleading posts",
      text: "Do not use Hyper to Be Free for fake fundraising, spam, suspicious links, impersonation, or misleading claims.",
    },
    {
      title: "Use care with sensitive topics",
      text: "Stories involving trauma, addiction, abuse, mental health, medical issues, or crisis situations should be shared with care and respect.",
    },
    {
      title: "Prayer support is not professional advice",
      text: "Prayer and encouragement can be powerful, but they do not replace medical, legal, financial, counseling, or emergency support when those are needed.",
    },
  ];

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
            <ShieldCheck className="h-4 w-4" />
            Community Guidelines
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
            Help keep Hyper to Be Free encouraging, safe, and faith-centered.
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            Hyper to Be Free is a place for testimonies, praise reports, prayer
            encouragement, and stories of freedom through God, Jesus, and the
            Holy Spirit. These guidelines help protect the heart of the
            community as people share and respond to one another.
          </p>

          <div className="mt-10 grid gap-5">
            {guidelines.map((item, index) => (
              <div
                key={item.title}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-sm font-black text-[#0b63ce] shadow-sm">
                    {index + 1}
                  </div>
                  <h2 className="text-xl font-black text-[#062a57]">
                    {item.title}
                  </h2>
                </div>
                <p className="leading-7 text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl bg-blue-50 p-5">
              <HeartHandshake className="mb-4 h-8 w-8 text-[#0b63ce]" />
              <h3 className="font-black text-[#062a57]">Encourage</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Respond in a way that helps people feel seen, prayed for, and
                supported.
              </p>
            </div>

            <div className="rounded-3xl bg-blue-50 p-5">
              <MessageCircleHeart className="mb-4 h-8 w-8 text-[#0b63ce]" />
              <h3 className="font-black text-[#062a57]">Pray</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Prayer requests and encouragement should be handled with care,
                respect, and humility.
              </p>
            </div>

            <div className="rounded-3xl bg-blue-50 p-5">
              <Flag className="mb-4 h-8 w-8 text-[#0b63ce]" />
              <h3 className="font-black text-[#062a57]">Report</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Content that does not fit the community can be reviewed and
                removed as the platform grows.
              </p>
            </div>
          </div>

          <div className="mt-10 rounded-3xl bg-[#082f63] p-6 text-white">
            <h2 className="text-2xl font-black">Review before posting</h2>
            <p className="mt-3 leading-7 text-blue-100">
              During the early draft version of Hyper to Be Free, submitted
              stories may be reviewed before anything is shared publicly. This
              helps protect the community and keeps the platform focused on
              testimony, prayer, praise, encouragement, and freedom.
            </p>
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/share-your-story"
              className="inline-flex justify-center rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
            >
              Share Your Story
            </Link>

            <Link
              href="/"
              className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
            >
              Return Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
