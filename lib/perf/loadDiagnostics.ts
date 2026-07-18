type DiagnosticCounter = {
  dbQueries?: number;
  signOperations?: number;
  recordsFetched?: number;
};

type DiagnosticPayload = DiagnosticCounter & {
  traceId: string;
  loader: string;
  phase: string;
  durationMs: number;
};

let traceCounter = 0;

export function isLoadDiagnosticsEnabled() {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_HTBF_LOAD_DIAGNOSTICS === "1") {
    return true;
  }
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("htbf-load-diagnostics") === "1";
  }
  return false;
}

export function createLoadTraceId(prefix: string) {
  traceCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${traceCounter}`;
}

export function logLoadDiagnostic(payload: DiagnosticPayload) {
  if (!isLoadDiagnosticsEnabled()) return;

  console.info(
    JSON.stringify({
      kind: "htbf_load_diagnostic",
      ...payload,
    })
  );
}

export async function measureLoad<T>(
  loader: string,
  phase: string,
  traceId: string,
  run: () => Promise<T>,
  counters?: DiagnosticCounter
): Promise<T> {
  if (!isLoadDiagnosticsEnabled()) {
    return run();
  }

  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return await run();
  } finally {
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    logLoadDiagnostic({
      traceId,
      loader,
      phase,
      durationMs: Math.round(ended - started),
      ...counters,
    });
  }
}
