const COMPACTION_THRESHOLD_TOKENS = 330_000;

/** Keep long-context sessions bounded independently of model metadata. */
export default function mandatoryCompaction(pi: any): void {
  pi.on("turn_end", (_event: unknown, ctx: any) => {
    const usage = ctx.getContextUsage?.();
    if (usage?.tokens == null || usage.tokens < COMPACTION_THRESHOLD_TOKENS) return;
    ctx.compact?.();
  });
}
