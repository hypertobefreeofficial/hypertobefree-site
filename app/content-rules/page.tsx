import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copyright,
  HeartHandshake,
  Mail,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

export default function ContentRulesPage() {
  const allowedItems = [
    "Faith testimonies",
    "Prayer requests",
    "Praise reports",
    "Encouraging messages",
    "Respectful discussion",
    "Stories of healing, restoration, peace, and freedom",
  ];

  const notAllowedItems = [
    "Harassment, bullying, threats, or intimidation",
    "Hate speech or demeaning attacks",
    "Sexually explicit content",
    "Graphic violence",
    "Copyrighted videos, music, sermons, or clips you do not have permission to share",
    "Spam, scams, fundraising fraud, or impersonation",
    "Medical, legal, financial, or counseling advice presented as professional guidance",
    "Personal information about someone else without permission",
  ];

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,196,87,0.35),transparent_32%),linear-gradient(120deg,#f8fbff_0%,#eaf5ff_52%,#fff7e6_100%)]" />

        <div className="relative mx-auto max-w-5xl px-5 py-8 md:px-6 md:py-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to HTBF
          </Link>

          <div className="mt-8 rounded-[2.5rem] bg-white/85 p-6 shadow-xl shadow-blue-950/5 ring-1 ring-white backdrop-blur md:p-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
              <ShieldCheck className="h-4 w-4" />
              Community Guidelines
            </div>

            <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
              Community Content Rules
            </h1>

            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              Hyper to Be Free is built for faith, prayer, testimony,
              encouragement, and respectful community. These rules help keep
              HTBF focused, safe, and uplifting for everyone.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <RuleHighlight
                icon={<HeartHandshake className="h-5 w-5" />}
                title="Faith-centered"
                text="Posts should support testimony, prayer, praise, encouragement, or respectful conversation."
              />

              <RuleHighlight
                icon={<MessageCircleHeart className="h-5 w-5" />}
                title="Respectful"
                text="Disagree with kindness. Do not attack, shame, threaten, or harass others."
              />

              <RuleHighlight
                icon={<Copyright className="h-5 w-5" />}
                title="Original or permitted"
                text="Only share videos, music, images, or clips you own or have permission to post."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-8 md:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <ContentCard
            tone="allowed"
            title="Allowed"
            subtitle="These are welcome in the HTBF community."
            icon={<CheckCircle2 className="h-6 w-6" />}
            items={allowedItems}
          />

          <ContentCard
            tone="notAllowed"
            title="Not Allowed"
            subtitle="These may be removed or restricted."
            icon={<XCircle className="h-6 w-6" />}
            items={notAllowedItems}
          />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-10 md:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <h2 className="text-2xl font-black text-[#062a57]">
              Moderation
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              We may remove content, hide posts, restrict accounts, or ban users
              when needed to protect the community. Repeated violations may lead
              to permanent removal from HTBF.
            </p>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Mail className="h-6 w-6" />
            </div>

            <h2 className="text-2xl font-black text-[#062a57]">
              Report Issues
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              If you see content that violates these rules, contact us so it can
              be reviewed.
            </p>

            <a
              href="mailto:reports@hypertobefree.com"
              className="mt-4 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#084f9f]"
            >
              reports@hypertobefree.com
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 md:px-6">
        <div className="rounded-[2.5rem] bg-[#082f63] p-6 text-white shadow-xl shadow-blue-950/10 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100">
                <Sparkles className="h-4 w-4" />
                Keep HTBF encouraging
              </div>

              <h2 className="text-3xl font-black tracking-tight">
                Share what builds faith, hope, and freedom.
              </h2>

              <p className="mt-3 max-w-2xl leading-7 text-blue-100">
                Before posting, ask whether your content encourages, uplifts,
                honors others, and fits the purpose of Hyper to Be Free.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex w-fit rounded-full bg-white px-5 py-3 text-sm font-black text-[#082f63] shadow-sm hover:bg-blue-50"
            >
              Return Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function RuleHighlight({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>

      <div className="font-black text-[#062a57]">{title}</div>

      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function ContentCard({
  tone,
  title,
  subtitle,
  icon,
  items,
}: {
  tone: "allowed" | "notAllowed";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: string[];
}) {
  const toneClasses =
    tone === "allowed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : "bg-rose-50 text-rose-700 ring-rose-100";

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${toneClasses}`}
      >
        {icon}
      </div>

      <h2 className="text-2xl font-black text-[#062a57]">{title}</h2>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {subtitle}
      </p>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="flex gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-700 ring-1 ring-slate-100"
          >
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                tone === "allowed" ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
