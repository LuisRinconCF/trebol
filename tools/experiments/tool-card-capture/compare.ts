/**
 * Join the two capture files into a side-by-side transcript, plus a compact
 * metrics table. Reads artifacts/tool-cards/{omp,swarm}.json.
 *
 *   bun tools/experiments/tool-card-capture/compare.ts [width]
 */
import { readFileSync } from "node:fs";

const width = Number(process.argv[2] ?? 80);
const root = "artifacts/tool-cards";
const load = (side: string) => JSON.parse(readFileSync(`${root}/${side}.json`, "utf8")).captures as Capture[];

interface Capture { id: string; width: number; phase: string; lines: string[]; renderer?: string; error?: string }

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;:?]*[A-Za-z]/g, "");
const omp = load("omp").filter((c) => c.width === width);
const swarm = load("swarm").filter((c) => c.width === width);

const out: string[] = [];
const rows: string[] = [];

for (const left of omp) {
  const right = swarm.find((c) => c.id === left.id && c.phase === left.phase);
  out.push(`\n${"═".repeat(width)}`);
  out.push(`${left.id}  ·  ${left.phase}  ·  width ${width}`);
  out.push("═".repeat(width));
  out.push(`── Oh My Pi ${"─".repeat(Math.max(0, width - 12))}`);
  out.push(...(left.lines.length ? left.lines : ["(no output)"]));
  out.push(`── Pi-Swarm (${right?.renderer ?? "n/a"}) ${"─".repeat(Math.max(0, width - 16 - (right?.renderer ?? "n/a").length))}`);
  out.push(...(right?.lines.length ? right.lines : ["(no card rendered)"]));

  const l = left.lines.length;
  const r = right?.lines.length ?? 0;
  const lFramed = left.lines.some((line) => /[│╭╰├]/.test(stripAnsi(line)));
  const rFramed = (right?.lines ?? []).some((line) => /[│╭╰├]/.test(stripAnsi(line)));
  const lColor = left.lines.some((line) => line.includes("\u001b["));
  const rColor = (right?.lines ?? []).some((line) => line.includes("\u001b["));
  rows.push([
    left.id.padEnd(20),
    left.phase.padEnd(7),
    `omp:${String(l).padStart(3)}`,
    `swarm:${String(r).padStart(3)}`,
    `frame ${lFramed ? "Y" : "n"}/${rFramed ? "Y" : "n"}`,
    `color ${lColor ? "Y" : "n"}/${rColor ? "Y" : "n"}`,
    right?.renderer ?? "n/a",
  ].join("  "));
}

out.push(`\n${"═".repeat(width)}`);
out.push("SUMMARY  (metric omp/swarm)");
out.push("═".repeat(width));
out.push(...rows);
process.stdout.write(`${out.join("\n")}\n`);
