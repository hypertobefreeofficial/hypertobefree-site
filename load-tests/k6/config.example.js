export const gateASummaryTrendStats = ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"];

export const gateAThresholds = {
  http_req_failed: ["rate<0.01"],
  htbf_feed_duration: ["p(95)<3000"],
  htbf_prayer_duration: ["p(95)<3000"],
  htbf_search_duration: ["p(95)<3000"],
  htbf_video_feed_duration: ["p(95)<3000"],
  htbf_mutation_duration: ["p(95)<2500"],
  checks: ["rate>0.99"],
};

export const baselineThresholds = {
  http_req_failed: ["rate<0.01"],
  htbf_feed_duration: ["p(95)<3000", "p(99)<5000"],
  htbf_prayer_duration: ["p(95)<3000", "p(99)<5000"],
  htbf_search_duration: ["p(95)<3000", "p(99)<5000"],
  htbf_video_feed_duration: ["p(95)<3000", "p(99)<5000"],
  htbf_mutation_duration: ["p(95)<2500"],
  checks: ["rate>0.99"],
};

export const smokeThresholds = {
  http_req_failed: ["rate<0.02"],
  htbf_video_feed_duration: ["p(95)<3000"],
  checks: ["rate>0.95"],
};

export const scenarioProfiles = {
  smoke10: {
    vus: 10,
    duration: "5m",
    thresholds: smokeThresholds,
  },
  baseline50: {
    stages: [
      { duration: "2m", target: 50 },
      { duration: "13m", target: 50 },
    ],
    thresholds: baselineThresholds,
  },
  gateA100: {
    stages: [
      { duration: "2m", target: 100 },
      { duration: "18m", target: 100 },
    ],
    thresholds: {
      ...gateAThresholds,
      htbf_load_phase_auth_requests: ["count==0"],
      htbf_auth_429: ["count==0"],
    },
  },
};

export const workloadMix = {
  feedBrowse: 0.35,
  prayerBrowse: 0.2,
  videoFeedBrowse: 0.15,
  searchBrowse: 0.1,
  reactions: 0.08,
  praying: 0.05,
  savesFollows: 0.03,
  reportsBlocks: 0.02,
  adminModeration: 0.02,
};

// Active local Gate A settings (example only — no real credentials):
// export HTBF_LOAD_TEST_ENV=local-staging
// export HTBF_BASE_URL=http://127.0.0.1:3100
// export HTBF_STAGING_PROJECT_REF=ACTUAL_STAGING_PROJECT_REF
// export HTBF_SUPABASE_URL=https://ACTUAL_STAGING_PROJECT_REF.supabase.co
// export HTBF_PREAUTH_SESSIONS_FILE=./load-tests/k6/fixtures/sessions.pool.local.json
// export HTBF_ALLOW_MUTATIONS=0
// export HTBF_ABORT_ON_ERROR=1
//
// Local Gate A scenarios (orchestrators under load-tests/scripts/):
// smoke-10.js — 10 VUs / 5 min (run-smoke-10.mjs)
// baseline-50.js — 50 VUs / 15 min (run-baseline-50.mjs)
// gate-a-100.js — 100 VUs / 20 min (run-gate-a-100.mjs; 10 cached sessions, zero load-phase auth)
//
// DISABLED — no k6 against Vercel, production, or HTBF_LOAD_TEST_ENV=staging:
// export HTBF_BASE_URL=https://your-preview.vercel.app
