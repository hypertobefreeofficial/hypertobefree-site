export function formatReportModalError(message: string, code?: string) {
  if (process.env.NODE_ENV === "development" && code) {
    return `${message} [${code}]`;
  }
  return message;
}
