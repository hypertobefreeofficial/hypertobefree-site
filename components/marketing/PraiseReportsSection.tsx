"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Badge } from "../ui/badge";
import { MarketingSection } from "./MarketingSection";

const praiseItems: [string, string][] = [
  ["Answered Prayer", "God made a way when I could not see one."],
  ["Healing", "Thankful for renewed strength and peace today."],
  ["Restoration", "God is restoring something I thought was lost."],
  ["Peace", "I woke up today with a calm heart."],
];

export function PraiseReportsSection() {
  return (
    <MarketingSection id="praise">
      <div className="rounded-htbf-panel bg-htbf-navy p-6 text-white shadow-2xl shadow-blue-950/10 sm:p-8 md:p-12">
        <div className="grid gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
          >
            <Badge variant="onDark" className="mb-4 px-4 py-2 text-sm">
              Praise Reports
            </Badge>

            <h2 className="font-heading text-3xl font-black tracking-tight sm:text-4xl">
              Small reminders. Real hope.
            </h2>

            <p className="mt-5 text-base leading-7 text-blue-100 sm:text-lg sm:leading-8">
              Short posts that help people see encouragement throughout the day —
              answered prayer, renewed peace, a door opening, a heart restored.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {praiseItems.map(([title, body], index) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-htbf-blue">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </div>
                <p className="font-heading font-bold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-blue-100">{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}
