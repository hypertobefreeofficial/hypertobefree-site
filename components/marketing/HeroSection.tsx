"use client";

import { motion } from "framer-motion";
import { Globe2, Play, Search, Send, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { SubtleGridBackground } from "./SubtleGridBackground";

const fadeUpItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const fadeUpContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <SubtleGridBackground />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-12 md:py-24 lg:py-28">
        <motion.div
          className="max-w-2xl"
          initial="hidden"
          animate="visible"
          variants={fadeUpContainer}
        >
          <motion.div
            variants={fadeUpItem}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-4 py-2 text-sm font-heading font-semibold text-htbf-blue shadow-sm backdrop-blur-sm"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Stories of freedom, hope, and praise
          </motion.div>

          <motion.h1
            variants={fadeUpItem}
            className="font-display text-4xl font-black leading-[1.05] tracking-tight text-htbf-navy-deep sm:text-5xl md:text-6xl lg:text-7xl"
          >
            See what God is doing in lives around the world.
          </motion.h1>

          <motion.p
            variants={fadeUpItem}
            className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8"
          >
            A faith-centered space for testimonies, praise reports, prayer
            encouragement, and stories of freedom through God, Jesus, and the
            Holy Spirit.
          </motion.p>

          <motion.div
            variants={fadeUpItem}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Button href="/share-your-story" variant="navy" size="lg">
              Share Your Story <Send className="h-4 w-4" aria-hidden />
            </Button>
            <Button href="/stories" variant="secondary" size="lg">
              Explore Testimonies <Search className="h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative mx-auto aspect-[4/5] max-h-[520px] w-full overflow-hidden rounded-htbf-panel shadow-2xl shadow-blue-950/10 sm:aspect-[5/6] md:max-h-none">
            <img
              src="/images/hero-freedom.png"
              alt="A person walking in freedom"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-htbf-navy/30 via-transparent to-white/10" />
          </div>

          <motion.div
            className="mt-4 rounded-3xl border border-white/80 bg-white/95 p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl md:absolute md:-left-4 md:top-8 md:mt-0 md:max-w-[19rem] lg:-left-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.45 }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-htbf-blue">
                <Play className="h-5 w-5 fill-htbf-blue" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-heading font-bold text-slate-900">
                  Latest Video Story
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Freedom · 1 min watch
                </p>
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              “I woke up with peace after weeks of anxiety.”
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {["Amen", "Praying", "Encouraged"].map((label) => (
                <Badge key={label} variant="muted" className="py-1">
                  {label}
                </Badge>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="mt-4 rounded-3xl border border-white/80 bg-white/95 p-4 shadow-xl shadow-blue-950/10 backdrop-blur-xl md:absolute md:-right-2 md:bottom-6 md:mt-0 md:max-w-[17rem] lg:-right-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.45 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-heading font-bold text-slate-900">
                From Around the World
              </p>
              <Globe2 className="h-4 w-4 text-htbf-blue" aria-hidden />
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              {[
                ["USA", "Praise Report"],
                ["Nigeria", "Testimony"],
                ["Philippines", "Prayer"],
              ].map(([place, type]) => (
                <div
                  key={place}
                  className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2"
                >
                  <span>{place}</span>
                  <span className="font-medium text-slate-500">{type}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
