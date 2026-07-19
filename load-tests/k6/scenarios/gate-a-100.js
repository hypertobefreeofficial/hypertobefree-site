import { sleep } from "k6";
import { gateASummaryTrendStats, scenarioProfiles } from "../config.example.js";
import { assertAllRuntimeGuards } from "../helpers/env.js";
import { abortOnHighErrorRate } from "../helpers/http.js";
import { auth429Count, loadPhaseAuthRequestCount } from "../helpers/gateAAuthMetrics.js";
import {
  assertPreauthSessionPoolReady,
  loadPreauthSessionPool,
  resolvePreauthSessionForVu,
} from "../helpers/gateA100Sessions.js";
import { runReadOnlyMix } from "./read-only-browse.js";

void auth429Count;
void loadPhaseAuthRequestCount;

export const options = {
  summaryTrendStats: gateASummaryTrendStats,
  scenarios: {
    gate_a: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: scenarioProfiles.gateA100.stages,
    },
  },
  thresholds: scenarioProfiles.gateA100.thresholds,
};

const sessionPool = loadPreauthSessionPool();

export function setup() {
  const runtime = assertAllRuntimeGuards({ requireMutations: false });
  assertPreauthSessionPoolReady(sessionPool);

  return {
    baseUrl: runtime.baseUrl,
    supabase: {
      supabaseUrl: runtime.supabase.supabaseUrl,
      projectRef: runtime.supabase.projectRef,
    },
    sessionCount: sessionPool.length,
    usePreauthSessions: true,
  };
}

const vuSessions = {};

export default function gateA100(data) {
  abortOnHighErrorRate();

  const anonKey = (__ENV.HTBF_SUPABASE_ANON_KEY || "").trim();

  if (!vuSessions[__VU]) {
    vuSessions[__VU] = resolvePreauthSessionForVu(sessionPool, __VU);
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
