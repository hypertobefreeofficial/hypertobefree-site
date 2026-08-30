import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("account deletion lifecycle migration", () => {
  it("migrates legacy completed rows and fixes audit retention FK", () => {
    const migration = readFileSync(
      "supabase/migrations/20260829190000_account_deletion_lifecycle_phase4c7b1b.sql",
      "utf8"
    );

    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("SET status = 'legacy_completed'");
    expect(migration).toContain("'completed'::text");
    expect(migration).toContain("ON DELETE SET NULL");
    expect(migration).toContain("current_user_is_admin()");
    expect(migration).toContain("enforce_account_deletion_user_cancellation");
    expect(migration).not.toContain("auth.admin.deleteUser");
    expect(migration).not.toContain("DELETE FROM public.account_deletion_requests");
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});
