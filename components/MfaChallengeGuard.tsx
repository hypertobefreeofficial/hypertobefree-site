"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MFA_DEFAULT_RETURN_TO,
  readMfaAssuranceState,
  requiresMfaChallenge,
  saveMfaReturnPath,
  shouldEnforceMfaChallenge,
} from "../lib/auth/mfaChallenge";
import { supabase } from "../lib/supabaseClient";

type MfaChallengeGuardProps = {
  children: ReactNode;
};

export default function MfaChallengeGuard({ children }: MfaChallengeGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function enforceMfaChallenge() {
      if (!shouldEnforceMfaChallenge(pathname)) {
        setReady(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setReady(true);
        }
        return;
      }

      const assurance = await readMfaAssuranceState(supabase);
      if (cancelled) {
        return;
      }

      if (assurance && requiresMfaChallenge(assurance)) {
        const returnPath =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : pathname ?? MFA_DEFAULT_RETURN_TO;

        saveMfaReturnPath(returnPath);
        router.replace("/mfa-challenge");
        return;
      }

      setReady(true);
    }

    setReady(false);
    void enforceMfaChallenge();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-8 shadow-sm">
          Checking your sign-in security...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
