import { matchesKey } from "@earendil-works/pi-tui";

type Preview = (name: string, ctx: any) => string | undefined;
type Pending = { id: string; name: string; reason: string; aborted: boolean };
type CorrectionState = { attempts: number; previews: Map<string, Preview>; pending?: Pending; seen: Set<string> };
const KEY = Symbol.for("pi-swarm-hook-correction");
const state: Map<string, CorrectionState> = ((globalThis as any)[KEY] ??= new Map());
const idOf = (ctx: any) => ctx?.sessionManager?.getSessionId?.();
const guidance = "Correct the SAME logical step using the hook feedback: choose the appropriate tool or corrected arguments. Do not blindly replay the rejected call or skip the step. All permissions and hooks still apply. If no authorized correction is possible, report the blocker and ask the user.";

/** One coordinator per extension API; state is shared by actual session identity. */
const owners = new WeakSet<object>();
export function installHookCorrection(pi: any): void {
  if (owners.has(pi)) return;
  owners.add(pi);
  let removeInput: (() => void) | undefined;
  pi.on("session_start", (_e: any, ctx: any) => {
    const id = idOf(ctx); if (!id) return;
    // Multiple extension instances join the same session coordinator.
    if (!state.has(id)) state.set(id, { attempts: 0, previews: new Map(), pending: undefined, seen: new Set() });
    removeInput = ctx.ui?.onTerminalInput?.((data: string) => {
      if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
        const s = state.get(id); if (s) { s.pending = undefined; s.attempts = 3; }
      }
    });
  });
  pi.on("input", (e: any, ctx: any) => {
    if (e.source !== "interactive" && e.source !== "rpc") return;
    const s = state.get(idOf(ctx)); if (s) { s.pending = undefined; s.attempts = 0; s.seen.clear(); }
  });
  pi.on("session_before_compact", (_e: any, ctx: any) => { const s = state.get(idOf(ctx)); if (s) s.pending = undefined; });
  pi.on("message_update", (e: any, ctx: any) => {
    const s = state.get(idOf(ctx));
    if (!s || s.pending || s.attempts >= 3 || ctx.signal?.aborted) return;
    const update = e.assistantMessageEvent;
    if (update?.type !== "toolcall_delta") return;
    const call = e.message?.content?.[update.contentIndex];
    if (!call?.id || !call.name || s.seen.has(call.id)) return;
    for (const preview of s.previews.values()) {
      let reason: string | undefined;
      try { reason = preview(call.name, ctx); } catch { continue; } // Final gate remains authoritative.
      if (!reason) continue;
      s.seen.add(call.id); s.attempts++;
      s.pending = { id: call.id, name: call.name, reason, aborted: false } satisfies Pending;
      pi.appendEntry?.("pi-swarm-hook-correction", { phase: "early-denial", callId: call.id, tool: call.name, attempt: s.attempts });
      ctx.ui?.notify?.(`Correcting ${call.name}: hook blocked this step`, "warning");
      ctx.abort();
      break;
    }
  });
  pi.on("message_end", (e: any, ctx: any) => {
    const p = state.get(idOf(ctx))?.pending;
    if (p && e.message?.role === "assistant") p.aborted = e.message.stopReason === "aborted";
  });
  // Native host settlement only; no timer-derived synthetic event.
  pi.on("agent_settled", (_e: any, ctx: any) => {
    const s = state.get(idOf(ctx)); const p: Pending | undefined = s?.pending;
    if (!p) return;
    s.pending = undefined;
    if (!p.aborted || !ctx.isIdle() || ctx.hasPendingMessages()) return;
    pi.appendEntry?.("pi-swarm-hook-correction", { phase: "correcting", callId: p.id, tool: p.name, attempt: s.attempts });
    return pi.sendMessage({ customType: "hook-correction", display: true,
      content: `The ${p.name} attempt was stopped during generation and did not execute. Other calls in that response did not execute either; reconsider them rather than assuming success.\nHook feedback: ${p.reason}\n${guidance}` }, { triggerTurn: true });
  });
  pi.on("session_shutdown", (_e: any, ctx: any) => { state.delete(idOf(ctx)); removeInput?.(); });
}

export function registerCorrectionPreview(pi: any, key: string, preview: Preview): void {
  installHookCorrection(pi);
  pi.on("session_start", (_e: any, ctx: any) => state.get(idOf(ctx))?.previews.set(key, preview));
}

export function correctionBlock(pi: any, event: any, ctx: any, reason: string) {
  const s = state.get(idOf(ctx));
  if (s && !s.seen.has(event.toolCallId)) { s.seen.add(event.toolCallId); s.attempts++; }
  const limit = s?.attempts >= 3;
  pi.appendEntry?.("pi-swarm-hook-correction", { phase: "blocked", callId: event.toolCallId, tool: event.toolName, attempt: s?.attempts });
  if (s && s.seen.size > 256) s.seen.delete(s.seen.values().next().value!);
  return { block: true, ...(limit ? { terminate: true } : {}), reason: `${reason || "Blocked by hook"}\n\n${limit ? "Repeated hook blocks: stop repeating this action. Report the unresolved blocker and request user direction; do not bypass the gate." : guidance}` };
}
