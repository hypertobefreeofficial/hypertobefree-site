import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-heading text-lg font-black text-htbf-navy">HTBF</p>
            <p className="mt-1 max-w-md text-sm font-medium leading-6 text-slate-600">
              Hyper to Be Free — stories of freedom, hope, prayer, and
              encouragement from a faith-centered community.
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-700">
              Contact:{" "}
              <a
                href="mailto:info@hypertobefree.com"
                className="text-htbf-blue underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 rounded-sm"
              >
                info@hypertobefree.com
              </a>
            </p>
          </div>

          <nav
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-heading font-bold text-slate-600"
            aria-label="Footer"
          >
            <Link
              href="/privacy"
              className="hover:text-htbf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 rounded-sm"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-htbf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 rounded-sm"
            >
              Terms of Service
            </Link>
            <Link
              href="/content-rules"
              className="hover:text-htbf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 rounded-sm"
            >
              Content Rules
            </Link>
            <Link
              href="/copyright"
              className="hover:text-htbf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 rounded-sm"
            >
              Copyright Removal
            </Link>
          </nav>
        </div>

        <p className="mt-6 text-xs font-semibold leading-6 text-slate-400">
          © {new Date().getFullYear()} Hyper to Be Free. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
