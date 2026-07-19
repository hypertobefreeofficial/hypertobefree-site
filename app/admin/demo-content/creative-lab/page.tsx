"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DemoCreativeLab from "../../../../components/demo-content/creative-lab/DemoCreativeLab";
import styles from "../../../../components/demo-content/creative-lab/creativeLab.module.css";
import { verifyCreativeLabAccess } from "../../../../lib/demo-content/creativeLabAccess";
import { supabase } from "../../../../lib/supabaseClient";

type AccessState = "loading" | "allowed" | "denied";

export default function CreativeLabPage() {
  const [accessState, setAccessState] = useState<AccessState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      const result = await verifyCreativeLabAccess(supabase);

      if (cancelled) return;

      if (result.allowed === false) {
        if (result.reason === "unauthenticated") {
          window.location.href = "/login";
          return;
        }

        setAccessState("denied");
        return;
      }

      setAccessState("allowed");
    }

    void verifyAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  if (accessState === "loading") {
    return (
      <div className={styles.accessDenied}>
        <h1>Creative Lab</h1>
        <p>Verifying owner access…</p>
      </div>
    );
  }

  if (accessState === "denied") {
    return (
      <div className={styles.accessDenied}>
        <h1>Owner access required</h1>
        <p>
          The Flagship Demo Creative Lab is available to HTBF admins only. It is
          not a public demo route.
        </p>
        <Link href="/feed">Return to Feed</Link>
      </div>
    );
  }

  return <DemoCreativeLab />;
}
