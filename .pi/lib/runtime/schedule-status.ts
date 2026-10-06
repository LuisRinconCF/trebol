/** Read-only, session-scoped view of the scheduler's live deadlines. No timers. */
export interface PendingSchedule { nextAt: number; kind: "loop" | "schedule" }
type Provider = (now: number) => PendingSchedule | undefined;
const KEY = Symbol.for("pi-swarm-schedule-status");
const providers: Map<string, Provider> = ((globalThis as any)[KEY] ??= new Map());

export function registerScheduleStatus(sessionId: string, provider: Provider): () => void {
  providers.set(sessionId, provider);
  return () => { if (providers.get(sessionId) === provider) providers.delete(sessionId); };
}

export function scheduleIdleStatus(sessionId: string | undefined, now = Date.now()): string | undefined {
  if (!sessionId) return;
  const pending = providers.get(sessionId)?.(now);
  if (!pending || !Number.isFinite(pending.nextAt)) return;
  const label = pending.kind === "loop" ? "LOOP" : "SCHEDULE";
  const seconds = Math.ceil((pending.nextAt - now) / 1000);
  if (seconds <= 0) return `${label} DUE`;
  const duration = seconds < 60 ? `${seconds}s`
    : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`
    : `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}m`;
  return `${label} IN ${duration}`;
}
