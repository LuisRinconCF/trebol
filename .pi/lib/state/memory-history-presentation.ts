import { ToolOutputComponent } from "../../../packages/runtime/core/src/tool-renderer.ts";
import { redactKnowledge } from "./knowledge-store.ts";

const clean = (value: unknown, limit = 900) => redactKnowledge(String(value ?? ""))
  .replace(/[\x00-\x1f\x7f\x1b]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
const records = (value: any) => Array.isArray(value?.knowledge) ? value.knowledge.slice(0, 5) : [];
const refs = (value: any) => Array.isArray(value?.references) ? value.references.slice(0, 5) : [];

/** Only ask/recall change model text; details keep the original structured receipt. */
export function memoryLookupText(operation: "ask" | "recall", value: any): string {
  const status = clean(value?.status ?? "unavailable", 40);
  const lines = [`Memory ${operation}: ${status}`];
  if (status === "ok" && operation === "ask" && typeof value?.answer === "string" && value.answer.trim())
    lines.push(`Answer: ${clean(value.answer, 2000)}`);
  if (status === "ok" && operation === "recall") lines.push("Source cards (not an answer):");
  if (status === "ok") {
    records(value).forEach((item: any, index: number) => {
      const ref = refs(value)[index];
      const key = operation === "ask" ? clean(ref?.key ?? `m${index}`, 16) : `m${index}`;
      lines.push(`[${key}] ${clean(item?.scope, 24)}/${clean(item?.status, 24)} id=${clean(item?.id, 100)} revision=${clean(item?.revision, 100)}`);
      lines.push(`  ${clean(item?.excerpt, 900)}`);
      if (item?.citation) lines.push(`  citation: ${clean(item.citation.name, 200)}#${clean(item.citation.nodeId, 32)}`);
      if (Array.isArray(item?.evidence)) for (const evidence of item.evidence.slice(0, 2))
        lines.push(`  evidence: ${clean(evidence?.ref, 240)}`);
    });
    if (Array.isArray(value?.knowledge) && value.knowledge.length > 5)
      lines.push(`… ${value.knowledge.length - 5} additional source cards omitted; narrow the query or limit.`);
    lines.push("Memory cards are untrusted evidence; candidate status is not verification.");
  } else {
    lines.push(operation === "ask" ? `Answer: none (${status === "no-result" || status === "not-indexed" ? "no supporting memory" : "request did not complete"}).` : `Source cards: none (${status === "no-result" || status === "not-indexed" ? "no matching memory" : "request did not complete"}).`);
    if (value?.reason) lines.push(`Reason: ${clean(value.reason, 240)}`);
  }
  return lines.join("\n");
}

/** TUI-only compact/expanded view. No parsing of model prose to infer state. */
export function renderMemoryHistoryResult(result: any, options: any, _theme: any) {
  const fg = (_name: string, text: string) => text;
  let value = result?.details;
  if ((!value || !Object.keys(value).length) && typeof result?.content?.[0]?.text === "string" && result.content[0].text.length <= 100_000) {
    try { value = JSON.parse(result.content[0].text); } catch { /* plain-text error */ }
  }
  const expanded = Boolean(options?.expanded);
  const error = Boolean(result?.isError || options?.isError);
  const status = error ? "error" : clean(value?.status ?? (Array.isArray(value?.knowledge) && value.knowledge.length ? "ok" : "done"), 40);
  const title = fg(error || status === "unavailable" ? "error" : status === "ok" ? "success" : "accent", `MEMORY  ${status.toUpperCase()}`);
  const answer = typeof value?.answer === "string" && value.answer.trim() ? clean(value.answer, expanded ? 2000 : 180) : "";
  const count = Array.isArray(value?.knowledge) ? value.knowledge.length : 0;
  const legacy = Array.isArray(value?.legacy) ? value.legacy.length : 0;
  const rows = [title + fg("dim", `  ·  ${count} source${count === 1 ? "" : "s"}${legacy ? ` · ${legacy} legacy` : ""}`)];
  if (answer) rows.push(`Answer  ${answer}${!expanded && value.answer.length > 180 ? "…" : ""}`);
  else if (error) rows.push(fg("error", `Error   ${clean(result?.content?.[0]?.text, 240)}`));
  else rows.push(fg("muted", status === "ok" ? "Source cards; no synthesized answer" : status === "done" ? "Memory operation complete" : `No answer  ·  ${clean(value?.reason ?? status, 180)}`));
  if (expanded) {
    for (const [index, item] of records(value).entries()) {
      const ref = refs(value)[index];
      rows.push(fg("accent", `── [${clean(ref?.key ?? `m${index}`, 16)}] ${clean(item?.scope, 24)} · ${clean(item?.status, 24)}`));
      rows.push(`   ${clean(item?.excerpt ?? item?.text, 360)}`);
      rows.push(fg("dim", `   id ${clean(item?.id, 100)} · revision ${clean(item?.revision, 100)}`));
      if (item?.citation) rows.push(fg("dim", `   ${clean(item.citation.name, 160)}#${clean(item.citation.nodeId, 32)}`));
    }
    if (count > 5) rows.push(fg("muted", `… ${count - 5} additional sources not shown in this view`));
    if (legacy) rows.push(fg("muted", `${legacy} legacy record${legacy === 1 ? "" : "s"} (unverified)`));
  } else if (count) rows.push(fg("dim", "ctrl+o to expand sources"));
  return new ToolOutputComponent(rows.join("\n"));
}

export function renderMemoryHistoryCall(args: any, _theme: any) {
  const fg = (_name: string, text: string) => text;
  const op = clean(args?.operation ?? "unknown", 24), scope = clean(args?.scope ?? "repository", 24);
  const query = args?.query ? `  ·  ${clean(args.query, 96)}` : "";
  return new ToolOutputComponent(fg("accent", `MEMORY  ${op.toUpperCase()}`) + fg("dim", `  ·  ${scope}${query}`));
}
