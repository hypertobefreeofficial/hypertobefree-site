import { sleep } from "k6";
import { scenarioProfiles } from "../config.example.js";
import { assertAllRuntimeGuards } from "../helpers/env.js";
import { resolveSessionForVu } from "../helpers/auth.js";
import { abortOnHighErrorRate } from "../helpers/http.js";
import { runReadOnlyMix } from "./read-only-browse.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: scenarioProfiles.smoke10.vus,
      duration: scenarioProfiles.smoke10.duration,
    },
  },
  thresholds: scenarioProfiles.smoke10.thresholds,
};

let runtime;

export function setup() {
  return assertAllRuntimeGuards({ requireMutations: false });
}

export default function smoke10(data) {
  runtime = data;
  abortOnHighErrorRate();

  const session = resolveSessionForVu(
    data.supabase.supabaseUrl,
    data.supabase.anonKey,
    data.users,
    __VU
  );

  runReadOnlyMix(
    data.supabase.supabaseUrl,
    data.supabase.anonKey,
    session.accessToken,
    Math.random()
  );

  sleep(1);
}
