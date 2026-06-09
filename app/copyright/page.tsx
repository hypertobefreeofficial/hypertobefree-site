import Link from "next/link";
import {
  ArrowLeft,
  Copyright,
  FileText,
  Mail,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

export default function CopyrightRemovalPage() {
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
              <Copyright className="h-4 w-4" />
              Copyright Removal
            </div>

            <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
              Copyright Removal Request
            </h1>

            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              Hyper to Be Free respects copyright ownership. If you believe
              content on HTBF includes your copyrighted material without
              permission, you may request review and removal.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <InfoBox
                icon={<ShieldCheck className="h-5 w-5" />}
                title="We review reports"
                text="We review copyright concerns and may remove or restrict content when appropriate."
              />

              <InfoBox
                icon={<FileText className="h-5 w-5" />}
                title="Provide details"
                text="Include the content link, your ownership claim, and how we can contact you."
              />

              <InfoBox
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Be accurate"
                text="Only submit a copyright report if you have a good-faith belief the content violates your rights."
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-8 md:px-6">
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
            <h2 className="text-3xl font-black text-[#062a57]">
              What to include
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              To help us review your request, please include the following
              information in your email:
            </p>

            <div className="mt-6 space-y-3">
              {[
                "Your full name or organization name",
                "Your contact email address",
                "A link or description of the content you want reviewed",
                "A description of the copyrighted work you believe was used",
                "A statement that you believe the use was not authorized",
                "A statement that the information you provided is accurate",
              ].map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-700 ring-1 ring-slate-100"
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0b63ce]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Mail className="h-6 w-6" />
            </div>

            <h2 className="text-3xl font-black text-[#062a57]">
              Send request
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              Email your copyright removal request to:
            </p>

            <a
              href="mailto:copyright@hypertobefree.com?subject=Copyright%20Removal%20Request"
              className="mt-5 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[#084f9f]"
            >
              copyright@hypertobefree.com
            </a>

            <p className="mt-5 text-sm leading-6 text-slate-500">
              You can later create a dedicated alias like
              copyright@hypertobefree.com or reports@hypertobefree.com, but
              using info@hypertobefree.com is fine for now.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 md:px-6">
        <div className="rounded-[2.5rem] bg-[#082f63] p-6 text-white shadow-xl shadow-blue-950/10 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100">
                <Copyright className="h-4 w-4" />
                HTBF copyright policy
              </div>

              <h2 className="text-3xl font-black tracking-tight">
                Only share content you own or have permission to post.
              </h2>

              <p className="mt-3 max-w-2xl leading-7 text-blue-100">
                This includes videos, music, sermons, images, clips, and written
                material. When in doubt, do not upload it.
              </p>
            </div>

            <Link
              href="/content-rules"
              className="inline-flex w-fit rounded-full bg-white px-5 py-3 text-sm font-black text-[#082f63] shadow-sm hover:bg-blue-50"
            >
              View Content Rules
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoBox({
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
