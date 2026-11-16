/**
 * Server-error counter for the System Health screen.
 *
 * In-process and reset on restart, and labelled that way in the UI. It is not
 * error monitoring — that needs an external store (Sentry or similar) that
 * survives restarts and aggregates across instances — but it is a real number
 * rather than an invented one.
 */
const startedAt = new Date();
let serverErrors = 0;
let lastServerErrorAt: Date | null = null;

export const errorStats = {
  recordServerError(): void {
    serverErrors += 1;
    lastServerErrorAt = new Date();
  },
  snapshot() {
    return {
      since: startedAt.toISOString(),
      serverErrors,
      lastServerErrorAt: lastServerErrorAt?.toISOString() ?? null,
    };
  },
};
