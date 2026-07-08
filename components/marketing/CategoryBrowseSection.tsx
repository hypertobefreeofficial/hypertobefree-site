import Link from "next/link";
import { Card } from "../ui/card";
import { MarketingSection } from "./MarketingSection";

const categories = [
  "Freedom",
  "Healing",
  "Answered Prayer",
  "Restoration",
  "Peace",
  "Encouragement",
];

export function CategoryBrowseSection() {
  return (
    <MarketingSection>
      <Card className="rounded-htbf-panel border-slate-200 p-6 sm:p-8 md:p-12">
        <div className="mb-7">
          <p className="text-sm font-heading font-bold uppercase tracking-[0.22em] text-htbf-blue">
            Browse
          </p>
          <h2 className="mt-2 font-heading text-3xl font-black tracking-tight text-htbf-navy-deep">
            Find encouragement by category
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          {categories.map((category) => (
            <Link
              key={category}
              href="/stories"
              className="rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-heading font-bold text-slate-700 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-htbf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              {category}
            </Link>
          ))}
        </div>
      </Card>
    </MarketingSection>
  );
}
