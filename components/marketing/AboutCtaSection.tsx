"use client";

import { motion } from "framer-motion";
import { Button } from "../ui/button";
import { SiteBrandLockup } from "./SiteBrandLockup";
import { MarketingSection } from "./MarketingSection";

export function AboutCtaSection() {
  return (
    <MarketingSection id="about" innerClassName="pb-16 pt-4 md:pb-20">
      <div className="grid gap-8 rounded-htbf-panel bg-gradient-to-br from-htbf-warm to-htbf-mist p-6 sm:p-8 md:grid-cols-[1fr_0.85fr] md:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <h2 className="font-heading text-3xl font-black tracking-tight text-htbf-navy-deep sm:text-4xl">
            Your story may be the encouragement someone else needs today.
          </h2>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            Whether your story is big or small, recent or years in the making, it
            matters. Enter HTBF to read stories from others, share what God has
            done, and be part of a community centered on freedom, hope, prayer,
            and encouragement.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/login" variant="primary" size="lg">
              Enter HTBF
            </Button>
            <Button href="/about" variant="secondary" size="lg">
              Learn More
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="rounded-htbf-card bg-white/80 p-6 shadow-sm ring-1 ring-white backdrop-blur-sm"
        >
          <SiteBrandLockup size="sm" />
          <p className="mt-4 leading-7 text-slate-600">
            Inspired by a dream of a place filled with people from all over the
            world sharing the good things God has done in their lives.
          </p>
        </motion.div>
      </div>
    </MarketingSection>
  );
}
