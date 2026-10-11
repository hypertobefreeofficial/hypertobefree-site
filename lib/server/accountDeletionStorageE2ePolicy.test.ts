import { describe, expect, it } from "vitest";
import {
  assertLocalSupabaseForStorageE2e,
  isLocalSupabaseProjectUrl,
} from "./accountDeletionStorageE2ePolicy";

describe("accountDeletionStorageE2ePolicy local-only host guard", () => {
  it.each([
    "https://ksavsjhlsjkcqylnywgs.supabase.co",
    "https://example.supabase.co",
    "http://192.168.1.10:54321",
    "http://0.0.0.0:54321",
    "http://localhost:54322",
    "http://127.0.0.1:54322",
  ])("rejects non-local or wrong-port URL %s", (url) => {
    expect(isLocalSupabaseProjectUrl(url)).toBe(false);
    expect(() => assertLocalSupabaseForStorageE2e(url)).toThrow(
      "storage_e2e_refused_non_local_supabase_url"
    );
  });

  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
  ])("allows established local Supabase URL %s", (url) => {
    expect(isLocalSupabaseProjectUrl(url)).toBe(true);
    expect(() => assertLocalSupabaseForStorageE2e(url)).not.toThrow();
  });
});
