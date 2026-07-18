export const gateAThresholds = {
  http_req_failed: ["rate<0.01"],
  htbf_feed_duration: ["p(95)<3000"],
  htbf_prayer_duration: ["p(95)<3000"],
  htbf_search_duration: ["p(95)<3000"],
  htbf_mutation_duration: ["p(95)<2500"],
  checks: ["rate>0.99"],
};

export const baselineThresholds = {
  http_req_failed: ["rate<0.01"],
  htbf_feed_duration: ["p(95)<3000"],
  htbf_prayer_duration: ["p(95)<3000"],
  htbf_search_duration: ["p(95)<3000"],
  htbf_mutation_duration: ["p(95)<2500"],
};

export const smokeThresholds = {
  http_req_failed: ["rate<0.02"],
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
    thresholds: gateAThresholds,
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

// Copy to your shell before running (example only — no real credentials):
// export HTBF_LOAD_TEST_ENV=staging
// export HTBF_BASE_URL=https://your-preview.vercel.app
// export HTBF_SUPABASE_URL=https://your-staging-project.supabase.co
// export HTBF_SUPABASE_ANON_KEY=your-staging-anon-key
// export HTBF_TEST_USER_POOL_FILE=./load-tests/k6/fixtures/users.pool.example.csv
// export HTBF_ALLOW_MUTATIONS=0
// export HTBF_ABORT_ON_ERROR=1
