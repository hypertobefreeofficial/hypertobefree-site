"use client";

import { motion } from "framer-motion";

export function HomeLoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-htbf-surface px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm rounded-htbf-card border border-slate-200 bg-white p-8 text-center shadow-sm"
        role="status"
        aria-live="polite"
        aria-label="Loading Hyper to Be Free"
      >
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-htbf-blue/10" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200">
            <img
              src="/images/htbf-logo.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
          </div>
        </div>

        <p className="mt-5 font-heading text-sm font-bold uppercase tracking-[0.2em] text-htbf-blue">
          Hyper to Be Free
        </p>
        <p className="mt-2 text-base font-medium text-slate-600">
          Preparing your experience…
        </p>

        <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="h-1.5 w-1.5 rounded-full bg-htbf-blue/70"
              animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1.1, 0.9] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: dot * 0.18,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>
    </main>
  );
}
