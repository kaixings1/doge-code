// Next.js boots this once per server process via the instrumentation hook.
// We use it to start the cron tick loop — without this call, scheduled jobs
// fire never, the calendar shows no run history, and the detail dialog has
// nothing to render in its Result section.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSchedulerRunning } = await import("@/server/scheduler/tick");
  ensureSchedulerRunning();
}
