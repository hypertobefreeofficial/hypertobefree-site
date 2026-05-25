import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck, AlertCircle } from "lucide-react";

export default function TermsPage() {
  const terms = [
    {
      title: "Use of the Website",
      text: "Hyper to Be Free is an early draft platform created for testimonies, praise reports, prayer encouragement, and stories of freedom through God, Jesus, and the Holy Spirit. By using this website, you agree to use it respectfully and in a way that supports the purpose of the community.",
    },
    {
      title: "User Submissions",
      text: "If you submit a story, testimony, praise report, prayer request, or other content, you are responsible for what you submit. Please do not submit anything false, harmful, private, or shared without permission.",
    },
    {
      title: "Permission to Review and Share",
      text: "Submitted content may be reviewed before anything is posted publicly. By submitting a story, you give Hyper to Be Free permission to review it and consider it for possible sharing on the website or related Hyper to Be Free platforms.",
    },
    {
      title: "Content Review and Removal",
      text: "Hyper to Be Free may decline, edit, remove, or choose not to publish submitted content at its discretion, especially if content does not fit the community guidelines or purpose of the platform.",
    },
    {
      title: "No Professional Advice",
      text: "Content on this website is for encouragement, testimony, prayer, and faith-based community support. It is not medical, legal, financial, counseling, emergency, or professional advice.",
    },
    {
      title: "Privacy and Personal Information",
      text: "Visitors should avoid submitting personal details they do not want shared. Information submitted through the website is handled according to the Privacy Policy.",
    },
    {
      title: "Changes to the Website",
      text: "Hyper to Be Free is still being developed. Features, pages, policies, and content may change as the platform grows.",
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
            <FileText className="h-4 w-4" />
            Terms of Use
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57] md:text-6xl">
            Terms of Use
          </h1>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            These Terms of Use explain the basic expectations for using Hyper to
            Be Free. This is an early draft version of the platform and these
            terms may be updated as the website grows.
          </p>

          <div className="mt-8 rounded-3xl bg-blue-50 p-5 text-sm leading-7 text-[#082f63]">
            <strong>Last updated:</strong> May 2026
          </div>

          <div className="mt-10 grid gap-5">
            {terms.map((item, index) => (
              <section
                key={item.title}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-6"
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
              </section>
            ))}
          </div>

          <div className="mt-10 rounded-3xl bg-[#082f63] p-6 text-white">
            <div className="mb-3 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-blue-100" />
              <h2 className="text-2xl font-black">Important note</h2>
            </div>
            <p className="leading-7 text-blue-100">
              Hyper to Be Free is not an emergency service. If someone is in
              immediate danger, facing a medical emergency, or in crisis, they
              should contact emergency services or a qualified professional in
              their area.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <div className="mb-3 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-[#0b63ce]" />
              <h2 className="text-2xl font-black text-[#062a57]">Contact</h2>
            </div>
            <p className="leading-7 text-slate-600">
              Questions about these terms can be sent to:
            </p>
            <p className="mt-3 font-bold text-[#0b63ce]">
              info@hypertobefree.com
            </p>
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/community-guidelines"
              className="inline-flex justify-center rounded-full bg-[#0b63ce] px-6 py-3.5 text-base font-bold text-white shadow-sm hover:bg-[#084f9f]"
            >
              Community Guidelines
            </Link>

            <Link
              href="/privacy"
              className="inline-flex justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-bold text-[#082f63] shadow-sm hover:bg-slate-50"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
