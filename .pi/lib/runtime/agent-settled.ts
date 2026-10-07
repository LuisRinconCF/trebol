/** Native Pi settlement only. Retain the final attempt payload for consumers
 * that inspect messages; never infer completion from a quiet-period timer.
 * Errors propagate to Pi's normal handler reporting. No process-global registry.
 */
export function onAgentSettled(pi: any, handler: (event: any, ctx: any) => unknown): void {
  let lastEnd: any;
  pi.on("agent_start", () => { lastEnd = undefined; });
  pi.on("agent_end", (event: any) => { lastEnd = event; });
  pi.on("agent_settled", (event: any, ctx: any) => {
    const final = lastEnd;
    lastEnd = undefined;
    return handler(final ? { ...final, type: "agent_settled" } : event, ctx);
  });
  pi.on("session_shutdown", () => { lastEnd = undefined; });
}
