import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  ALLOWED_LOAD_TEST_ENV,
  assertExactStagingSupabaseUrl,
  assertLocalStagingBaseUrl,
  resolveStagingProjectRef,
} from "./stagingGuards.mjs";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("Gate A staging project-reference guard", () => {
  beforeEach(() => {
    restoreEnv();
    process.env.HTBF_LOAD_TEST_ENV = ALLOWED_LOAD_TEST_ENV;
    process.env.HTBF_REQUIRE_STAGING_REF = "1";
    process.env.HTBF_LOCAL_TEST_PORT = "3100";
  });

  afterEach(() => {
    restoreEnv();
  });

  it("passes when the generated staging reference matches the Supabase hostname exactly", () => {
    process.env.HTBF_STAGING_PROJECT_REF = "abcdxyzstaging123";
    const result = assertExactStagingSupabaseUrl(
      "https://abcdxyzstaging123.supabase.co"
    );
    expect(result.expectedHostname).toBe("abcdxyzstaging123.supabase.co");
    expect(result.projectRef).toBe("abcdxyzstaging123");
  });

  it('fails when HTBF_STAGING_PROJECT_REF is the branch display name "htbf-staging"', () => {
    process.env.HTBF_STAGING_PROJECT_REF = "htbf-staging";
    expect(() =>
      assertExactStagingSupabaseUrl("https://abcdxyzstaging123.supabase.co")
    ).toThrow(/branch display name/i);
  });

  it("fails when the staging URL reference does not match HTBF_STAGING_PROJECT_REF", () => {
    process.env.HTBF_STAGING_PROJECT_REF = "abcdxyzstaging123";
    expect(() =>
      assertExactStagingSupabaseUrl("https://productionref999.supabase.co")
    ).toThrow(/must exactly match/i);
  });

  it("fails when HTBF_STAGING_PROJECT_REF is missing under strict checking", () => {
    delete process.env.HTBF_STAGING_PROJECT_REF;
    expect(() =>
      assertExactStagingSupabaseUrl("https://abcdxyzstaging123.supabase.co")
    ).toThrow(/HTBF_STAGING_PROJECT_REF must be set/i);
  });

  it("resolveStagingProjectRef rejects htbf-staging display name", () => {
    process.env.HTBF_STAGING_PROJECT_REF = "htbf-staging";
    expect(() => resolveStagingProjectRef()).toThrow(/branch display name/i);
  });
});

describe("Gate A local-staging base URL guard", () => {
  beforeEach(() => {
    restoreEnv();
    process.env.HTBF_LOCAL_TEST_PORT = "3100";
  });

  afterEach(() => {
    restoreEnv();
  });

  it("accepts the configured local production build URL", () => {
    const result = assertLocalStagingBaseUrl("http://127.0.0.1:3100");
    expect(result.hostname).toBe("127.0.0.1");
    expect(result.port).toBe(3100);
  });

  it("rejects Vercel hostnames", () => {
    expect(() =>
      assertLocalStagingBaseUrl(
        "https://hypertobefree-site-example.vercel.app"
      )
    ).toThrow(/Vercel deployment/i);
  });

  it("rejects hypertobefree.com", () => {
    expect(() =>
      assertLocalStagingBaseUrl("https://www.hypertobefree.com")
    ).toThrow(/production HTBF domain/i);
  });

  it("rejects non-local hostnames", () => {
    expect(() =>
      assertLocalStagingBaseUrl("http://192.168.1.20:3100")
    ).toThrow(/not a permitted local test host/i);
  });

  it("rejects alternate localhost ports unless explicitly permitted", () => {
    expect(() =>
      assertLocalStagingBaseUrl("http://127.0.0.1:3000")
    ).toThrow(/must use port 3100/i);
  });
});
