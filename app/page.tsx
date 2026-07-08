"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { HeroSection } from "../components/marketing/HeroSection";
import { StoriesSection } from "../components/marketing/StoriesSection";
import { PraiseReportsSection } from "../components/marketing/PraiseReportsSection";
import { FeaturesSection } from "../components/marketing/FeaturesSection";
import { CategoryBrowseSection } from "../components/marketing/CategoryBrowseSection";
import { AboutCtaSection } from "../components/marketing/AboutCtaSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { HomeLoadingState } from "../components/marketing/HomeLoadingState";

export default function HomePage() {
  const [checkingUser, setCheckingUser] = useState(true);

  useEffect(() => {
    async function checkUserProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCheckingUser(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.profile_completed === true) {
        window.location.href = "/feed";
        return;
      }

      window.location.href = "/account";
    }

    checkUserProfile();
  }, []);

  if (checkingUser) {
    return <HomeLoadingState />;
  }

  return (
    <div className="min-h-screen bg-htbf-surface text-slate-900">
      <MarketingHeader />

      <main>
        <HeroSection />
        <StoriesSection />
        <PraiseReportsSection />
        <FeaturesSection />
        <CategoryBrowseSection />
        <AboutCtaSection />
      </main>

      <MarketingFooter />
    </div>
  );
}
