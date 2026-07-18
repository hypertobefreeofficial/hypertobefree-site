import { sleep } from "k6";
import { scenarioProfiles } from "../config.example.js";
import { assertAllRuntimeGuards } from "../helpers/env.js";
import { resolveSessionForVu } from "../helpers/auth.js";
import { abortOnHighErrorRate } from "../helpers/http.js";
import { runReadOnlyMix } from "./read-only-browse.js";
import { runAuthenticatedMix } from "./authenticated-actions.js";

export const options = {
  scenarios: {
    gate_a: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: scenarioProfiles.gateA100.stages,
    },
  },
  thresholds: scenarioProfiles.gateA100.thresholds,
};

export function setup() {
  return assertAllRuntimeGuards({ requireMutations: false });
}

export default function gateA100(data) {
  abortOnHighErrorRate();

  const session = resolveSessionForVu(
    data.supabase.supabaseUrl,
    data.supabase.anonKey,
    data.users,
    __VU
  );

  const roll = Math.random();

  if (roll < 0.88) {
    runReadOnlyMix(
      data.supabase.supabaseUrl,
      data.supabase.anonKey,
      session.accessToken,
      Math.random()
    );
  } else if (__ENV.HTBF_ALLOW_MUTATIONS === "1") {
    runAuthenticatedMix(
      data.baseUrl,
      data.supabase.supabaseUrl,
      data.supabase.anonKey,
      session,
      Math.random()
    );
  } else {
    runReadOnlyMix(
      data.supabase.supabaseUrl,
      data.supabase.anonKey,
      session.accessToken,
      Math.random()
    );
  }

  sleep(1);
}
