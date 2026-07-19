import { supabase } from "../supabaseClient";

/** Tables that must share demo columns before seeding or mandatory isolation. */
export const REQUIRED_DEMO_SCHEMA_TABLES = [
  "profiles",
  "stories",
  "prayer_video_responses",
  "story_reactions",
  "content_reports",
  "saved_content",
  "prayer_follows",
  "prayer_written_responses",
  "story_video_replies",
] as const;

export type DemoContentSchemaTable = (typeof REQUIRED_DEMO_SCHEMA_TABLES)[number];

export type DemoContentSchemaState = "pre_schema" | "ready" | "schema_drift";

export class DemoContentSchemaProbeError extends Error {
  readonly table: DemoContentSchemaTable;
  readonly column: string;
  readonly cause: unknown;

  constructor(table: DemoContentSchemaTable, column: string, cause: unknown) {
    super(
      `[demo-content] Could not verify ${table}.${column}; demo isolation probe failed`
    );
    this.name = "DemoContentSchemaProbeError";
    this.table = table;
    this.column = column;
    this.cause = cause;
  }
}

export class DemoContentSchemaDriftError extends Error {
  readonly presentTables: DemoContentSchemaTable[];
  readonly missingTables: DemoContentSchemaTable[];

  constructor(options: {
    presentTables: DemoContentSchemaTable[];
    missingTables: DemoContentSchemaTable[];
  }) {
    super(
      `[demo-content] Demo schema drift detected — ${options.presentTables.length} table(s) have is_demo while ${options.missingTables.length} do not. Public loading cannot continue until migration is fully applied.`
    );
    this.name = "DemoContentSchemaDriftError";
    this.presentTables = options.presentTables;
    this.missingTables = options.missingTables;
  }
}

export type DemoContentSchemaReadiness = {
  state: DemoContentSchemaState;
  tables: Record<DemoContentSchemaTable, { hasIsDemo: boolean }>;
  /** True only when state === "ready". */
  genuinePublicIsolationActive: boolean;
};

type TableProbeState = "present" | "missing";

let cachedReadiness: DemoContentSchemaReadiness | null = null;
let readinessPromise: Promise<DemoContentSchemaReadiness> | null = null;
const tableProbeCache = new Map<DemoContentSchemaTable, TableProbeState>();

function isMissingColumnError(message: string, column: string) {
  return (
    new RegExp(column, "i").test(message) &&
    /column|schema|does not exist|could not find/i.test(message)
  );
}

async function probeReadableColumn(
  table: DemoContentSchemaTable,
  column: string
): Promise<boolean> {
  const cached = tableProbeCache.get(table);
  if (cached !== undefined) {
    return cached === "present";
  }

  const { error } = await supabase.from(table).select(column).limit(1);

  if (!error) {
    tableProbeCache.set(table, "present");
    return true;
  }

  if (isMissingColumnError(error.message, column)) {
    tableProbeCache.set(table, "missing");
    return false;
  }

  throw new DemoContentSchemaProbeError(table, column, error);
}

function resolveSchemaState(
  tableResults: Record<DemoContentSchemaTable, boolean>
): DemoContentSchemaState {
  const present = REQUIRED_DEMO_SCHEMA_TABLES.filter((table) => tableResults[table]);
  const missing = REQUIRED_DEMO_SCHEMA_TABLES.filter((table) => !tableResults[table]);

  if (present.length === 0) {
    return "pre_schema";
  }

  if (missing.length === 0) {
    return "ready";
  }

  return "schema_drift";
}

function buildReadiness(
  tableResults: Record<DemoContentSchemaTable, boolean>
): DemoContentSchemaReadiness {
  const state = resolveSchemaState(tableResults);

  if (state === "schema_drift") {
    const presentTables = REQUIRED_DEMO_SCHEMA_TABLES.filter(
      (table) => tableResults[table]
    );
    const missingTables = REQUIRED_DEMO_SCHEMA_TABLES.filter(
      (table) => !tableResults[table]
    );
    throw new DemoContentSchemaDriftError({ presentTables, missingTables });
  }

  const tables = REQUIRED_DEMO_SCHEMA_TABLES.reduce(
    (accumulator, table) => {
      accumulator[table] = { hasIsDemo: tableResults[table] };
      return accumulator;
    },
    {} as Record<DemoContentSchemaTable, { hasIsDemo: boolean }>
  );

  if (state === "pre_schema") {
    console.warn(
      "[demo-content] Demo schema not detected — genuine-public demo isolation inactive until migration is applied."
    );
  }

  return {
    state,
    tables,
    genuinePublicIsolationActive: state === "ready",
  };
}

/** Cached readiness probe — each table probed at most once per process. */
export async function getDemoContentSchemaReadiness(): Promise<DemoContentSchemaReadiness> {
  if (cachedReadiness) return cachedReadiness;
  if (readinessPromise) return readinessPromise;

  readinessPromise = (async () => {
    const probeResults = await Promise.all(
      REQUIRED_DEMO_SCHEMA_TABLES.map(async (table) => ({
        table,
        hasIsDemo: await probeReadableColumn(table, "is_demo"),
      }))
    );

    const tableResults = probeResults.reduce(
      (accumulator, result) => {
        accumulator[result.table] = result.hasIsDemo;
        return accumulator;
      },
      {} as Record<DemoContentSchemaTable, boolean>
    );

    cachedReadiness = buildReadiness(tableResults);
    return cachedReadiness;
  })();

  try {
    return await readinessPromise;
  } catch (error) {
    readinessPromise = null;
    throw error;
  } finally {
    if (cachedReadiness) {
      readinessPromise = null;
    }
  }
}

/** Future seed commands must call this and require state === "ready". */
export async function assertDemoSchemaReadyForSeeding() {
  const readiness = await getDemoContentSchemaReadiness();
  if (readiness.state !== "ready") {
    throw new Error(
      `Demo seeding requires schema state "ready"; current state is "${readiness.state}".`
    );
  }
  return readiness;
}

/** Test helper — reset cached probe between tests. */
export function resetDemoContentSchemaReadinessCache() {
  cachedReadiness = null;
  readinessPromise = null;
  tableProbeCache.clear();
}

/** Test helper — inspect per-table probe cache state. */
export function getDemoContentTableProbeCacheForTests() {
  return tableProbeCache;
}
