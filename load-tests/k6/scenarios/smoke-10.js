import { sleep } from "k6";
import { gateASummaryTrendStats, scenarioProfiles } from "../config.example.js";
import { assertAllRuntimeGuards } from "../helpers/env.js";
import { resolveSessionForVu } from "../helpers/auth.js";
import { abortOnHighErrorRate } from "../helpers/http.js";
import { runReadOnlyMix } from "./read-only-browse.js";

export const options = {
  summaryTrendStats: gateASummaryTrendStats,
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: scenarioProfiles.smoke10.vus,
      duration: scenarioProfiles.smoke10.duration,
    },
  },
  thresholds: scenarioProfiles.smoke10.thresholds,
};

export function setup() {
  const runtime = assertAllRuntimeGuards({ requireMutations: false });
  return {
    baseUrl: runtime.baseUrl,
    supabase: {
      supabaseUrl: runtime.supabase.supabaseUrl,
      projectRef: runtime.supabase.projectRef,
    },
    users: runtime.users,
  };
}

const vuSessions = {};

export default function smoke10(data) {
  abortOnHighErrorRate();

  const anonKey = (__ENV.HTBF_SUPABASE_ANON_KEY || "").trim();

  if (!vuSessions[__VU]) {
    vuSessions[__VU] = resolveSessionForVu(
      data.supabase.supabaseUrl,
      anonKey,
      data.users,
      __VU
    );
  }

  const session = vuSessions[__VU];

  runReadOnlyMix(
    data.supabase.supabaseUrl,
    anonKey,
    session.accessToken,
    Math.random()
  );

  sleep(1);
}
