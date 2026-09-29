/** Cross-extension lookup: Pi gives each extension its own API facade. */
export interface AutoModeHandle { enabled(): boolean; generation(): number; }
const key = Symbol.for("pi-swarm-auto-mode-sessions");
const sessions: Map<string, AutoModeHandle> = ((globalThis as any)[key] ??= new Map());
export function bindAutoMode(ctx: any, handle: AutoModeHandle): void {
  const id = ctx?.sessionManager?.getSessionId?.();
  if (id) sessions.set(id, handle);
}
export function unbindAutoMode(ctx: any, handle: AutoModeHandle): void {
  const id = ctx?.sessionManager?.getSessionId?.();
  if (id && sessions.get(id) === handle) sessions.delete(id);
}
export function autoModeFor(ctx: any): AutoModeHandle | undefined {
  const id = ctx?.sessionManager?.getSessionId?.();
  const handle = id ? sessions.get(id) : undefined;
  return handle?.enabled() ? handle : undefined;
}
