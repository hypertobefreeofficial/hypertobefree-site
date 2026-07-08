"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SiteBrandLockup } from "./SiteBrandLockup";
import { Button } from "../ui/button";

const navLinks = [
  { href: "#", label: "Home" },
  { href: "#stories", label: "Stories" },
  { href: "#praise", label: "Praise Reports" },
  { href: "#about", label: "About" },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4">
        <Link href="/" aria-label="HTBF home" className="shrink-0">
          <SiteBrandLockup />
        </Link>

        <nav
          className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex"
          aria-label="Primary"
        >
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="transition-colors hover:text-htbf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 focus-visible:ring-offset-2 rounded-sm"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            href="/login"
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            Sign In
          </Button>

          <Button href="/share-your-story" variant="primary" size="md">
            Share Your Story
          </Button>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-htbf-blue/40 md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-200/80 bg-white md:hidden"
            aria-label="Mobile"
          >
            <div className="space-y-1 px-4 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-3 text-sm font-heading font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-htbf-blue"
                >
                  {link.label}
                </a>
              ))}
              <Button
                href="/login"
                variant="ghost"
                size="md"
                className="mt-2 w-full justify-center sm:hidden"
                onClick={() => setMobileOpen(false)}
              >
                Sign In
              </Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
