export type ContentReportFailureStage =
  | "constraint_failure"
  | "foreign_key_failure"
  | "schema_missing"
  | "insert_denied"
  | "unknown_insert_failure";

export function classifyContentReportInsertError(error: {
  code?: string | null;
  message?: string | null;
}) {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (code === "23503" || /foreign key/i.test(message)) {
    return {
      stage: "foreign_key_failure" as const,
      httpStatus: 422,
      code: "foreign_key_failure",
      error: "We couldn't submit your report. Please try again.",
    };
  }

  if (
    code === "23514" ||
    code === "23505" ||
    /check constraint|violates check|duplicate key|unique constraint/i.test(
      message
    )
  ) {
    return {
      stage: "constraint_failure" as const,
      httpStatus: 422,
      code: "constraint_failure",
      error: "We couldn't submit your report. Please try again.",
    };
  }

  if (
    code === "42703" ||
    code === "PGRST204" ||
    /column|schema|does not exist|could not find/i.test(message)
  ) {
    return {
      stage: "schema_missing" as const,
      httpStatus: 503,
      code: "schema_missing",
      error: "Reporting is unavailable right now.",
    };
  }

  if (/permission denied|rls|row-level security|not authorized/i.test(message)) {
    return {
      stage: "insert_denied" as const,
      httpStatus: 503,
      code: "insert_denied",
      error: "Reporting is unavailable right now.",
    };
  }

  return {
    stage: "unknown_insert_failure" as const,
    httpStatus: 500,
    code: "insert_failed",
    error: "We couldn't submit your report. Please try again.",
  };
}
