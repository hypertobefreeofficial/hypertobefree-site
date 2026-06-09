import Link from "next/link";
import { ArrowLeft, ShieldCheck, Mail, FileText, Lock } from "lucide-react";

export default function PrivacyPage() {
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
            Privacy Policy
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
            Privacy Policy
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            This Privacy Policy explains how Hyper to Be Free may collect, use,
            and protect information submitted through this website. This is an
            early draft version of the platform and may be updated as new
            features are added.
          </p>

          <div className="mt-8 rounded-3xl bg-blue-50 p-5 text-sm leading-7 text-[#082f63]">
            <strong>Last updated:</strong> May 2026
          </div>

          <div className="mt-10 grid gap-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <FileText className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  rmation We May Collect
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                Hyper to Be Free may collect rmation that visitors choose to
                submit, such as a name or first name, email address, optional
                location, story type, testimony, praise report, prayer
                encouragement, or other written content submitted through the
                website.
              </p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  How We May Use rmation
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                Submitted rmation may be used to review stories, respond to
                messages, contact submitters when needed, improve the website,
                and consider whether a story may be shared on the platform.
                Stories are intended to be reviewed before anything is shared
                publicly.
              </p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <Lock className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  Public Sharing
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                Hyper to Be Free does not intend to publicly share a submitted
                story without review. If a story is selected for sharing, the
                platform may contact the submitter or rely on the permission
                given through the submission form. Visitors should avoid
                submitting private details they do not want shared.
              </p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <div className="mb-3 flex items-center gap-3">
                <Mail className="h-6 w-6 text-[#0b63ce]" />
                <h2 className="text-2xl font-black text-[#062a57]">
                  Contact
                </h2>
              </div>

              <p className="leading-7 text-slate-600">
                Questions about privacy or submitted rmation can be sent to:
              </p>

              <p className="mt-3 font-bold text-[#0b63ce]">
                privacy@hypertobefree.com
              </p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-[#062a57]">
                Updates to This Policy
              </h2>

              <p className="mt-3 leading-7 text-slate-600">
                This Privacy Policy may be updated as Hyper to Be Free grows,
                adds features, or changes how submissions, accounts, videos, or
                other content are handled.
              </p>
            </section>
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/community-guidelines"
              className="inline-flex justify-center rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
            >
              Community Guidelines
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
