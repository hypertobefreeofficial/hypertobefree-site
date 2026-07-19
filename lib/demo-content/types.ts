/**
 * Internal demo-content metadata carried on canonical rows.
 * Seed identifiers must not be rendered in normal user-facing UI or logs.
 */
export type DemoContentFieldSnapshot = {
  is_demo?: boolean | null;
  demo_seed_run_id?: string | null;
  demo_scenario_id?: string | null;
  content_origin?: string | null;
  demo_display_label?: string | null;
  is_ai_generated?: boolean | null;
  demo_media_transcript?: string | null;
  demo_tour_state?: unknown;
};

/**
 * Genuine public loaders always use `genuine_public`.
 * Controlled demo loaders (future guided tour) must opt in explicitly.
 */
export type DemoLoaderMode = "genuine_public" | "controlled_demo";

export const GENUINE_PUBLIC_DEMO_RULE =
  "Genuine public loaders include only is_demo = false. Demo records require an internal controlled demo loader.";

/**
 * Production safety: do not merge Phase 2A loader isolation into main until the
 * production demo schema migration is separately reviewed and approved.
 * Preview deployments must not point at production Supabase without demo columns.
 */
export const DEMO_CONTENT_PRODUCTION_MERGE_GATE =
  "Requires approved production application of 20260725_demo_content_system.sql before merge to main.";
