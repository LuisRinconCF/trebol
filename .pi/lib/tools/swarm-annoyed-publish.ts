/**
 * Model-boundary port of Swarm's `annoyed` tool (internal/tools/builtin/
 * annoyed.go, annoyed_issue.go, annoyed_publish.go): the model sees either
 *   <result status="ok" [severity="…"]>
 *     <issue><![CDATA[…]]></issue>
 *     <publication_url><![CDATA[…]]></publication_url>
 *     <repository><![CDATA[…]]></repository>
 *   </result>
 * or a tool error such as
 *   annoyed: GitHub API POST repos/Swarm-Code/mono/issues: exit status 4: <stderr>
 * Publication goes through `gh api --method POST repos/<repo>/issues --input -`
 * with GH_PROMPT_DISABLED=1, exactly like annoyedGHAPI. The issue BODY is
 * host-owned (Swarm renders a redacted transcript; Pi renders its board
 * record) and never reaches the model.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { goQuote } from "./swarm-bash.ts";

export const DEFAULT_ANNOYED_REPOSITORY = "cloverinternational/trebol";
const MAX_TITLE_CHARS = 120;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function annoyedRepository(configured = "", environment = process.env.SWARM_ANNOYED_REPOSITORY ?? ""): string {
  let repository = configured.trim() || environment.trim() || DEFAULT_ANNOYED_REPOSITORY;
  if (!repositoryPattern.test(repository)) throw new Error(`annoyed: invalid repository ${JSON.stringify(repository)}; expected owner/name`);
  return repository;
}

export function normalizeAnnoyedSeverity(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "low" || v === "medium" || v === "high" ? v : "";
}

export function annoyedIssueTitle(issue: string): string {
  const title = issue.split(/\s+/).filter(Boolean).join(" ");
  if (title === "") return "Agent feedback";
  const runes = [...title];
  return runes.length > MAX_TITLE_CHARS ? runes.slice(0, MAX_TITLE_CHARS - 1).join("") + "…" : title;
}

export function annoyedPublicTitle(issue: string, severity: string): string {
  return annoyedIssueTitle(severity ? `[${severity.toUpperCase()}] ${issue}` : issue);
}

/** Go exec error text for a non-zero exit / signal (os/exec ExitError.Error()). */
const exitText = (code: number | null, signal: NodeJS.Signals | null) => code !== null ? `exit status ${code}` : `signal: ${String(signal ?? "").toLowerCase()}`;

export interface GHRunner { (args: string[], stdin: string, signal?: AbortSignal): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; spawnError?: Error }> }
const defaultGH: GHRunner = (args, stdin, abortSignal) => new Promise((resolveP) => {
  if (abortSignal?.aborted) return resolveP({ code: null, signal: null, stdout: "", stderr: "", spawnError: new Error("cancelled") });
  const child = spawn("gh", args, { env: { ...process.env, GH_PROMPT_DISABLED: "1" }, stdio: ["pipe", "pipe", "pipe"] });
  const out: Buffer[] = [], err: Buffer[] = [];
  let bytes = 0;
  const abort = () => child.kill("SIGKILL"); abortSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 30_000);
  const collect = (target: Buffer[], d: Buffer) => { bytes += d.length; if (bytes > 4 * 1024 * 1024) abort(); else target.push(d); };
  child.stdout.on("data", (d: Buffer) => collect(out, d)); child.stderr.on("data", (d: Buffer) => collect(err, d));
  child.stdin.on("error", () => undefined);
  child.on("error", (e) => resolveP({ code: null, signal: null, stdout: "", stderr: "", spawnError: e }));
  child.on("close", (code, signal) => { clearTimeout(timer); abortSignal?.removeEventListener("abort", abort); resolveP({ code, signal, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() }); });
  child.stdin.end(stdin);
});

export async function reconcileAnnoyedIssue(repository: string, marker: string, signal?: AbortSignal, gh: GHRunner = defaultGH): Promise<string> {
  if (signal?.aborted) throw new Error("annoyed: cancelled");
  const lookup = await gh(["api", "--paginate", "--slurp", "--method", "GET", `repos/${repository}/issues?state=all&per_page=100`], "", signal);
  if (signal?.aborted) throw new Error("annoyed: cancelled");
  if (lookup.code !== 0 || lookup.spawnError) throw new Error("annoyed: publication unresolved; verification lookup failed");
  let issues: any[];
  try { const decoded = JSON.parse(lookup.stdout); if (!Array.isArray(decoded)) throw new Error(); issues = decoded.flat(); }
  catch { throw new Error("annoyed: publication unresolved; verification response invalid"); }
  const matches = issues.filter(item => !item?.pull_request && typeof item?.body === "string" && item.body.includes(`**Report marker:** \`${marker}\``) && validIssueURL(String(item.html_url), repository, item.number));
  if (matches.length !== 1) throw new Error("annoyed: publication unresolved; unique exact marker not visible; refusing blind retry");
  return matches[0].html_url;
}

export async function publishAnnoyedIssue(repository: string, title: string, body: string, gh: GHRunner = defaultGH, signal?: AbortSignal): Promise<string> {
  const endpoint = `repos/${repository}/issues`;
  if (signal?.aborted) throw new Error("annoyed: cancelled");
  const resolveAmbiguous = async () => {
    const marker = markerFromBody(body);
    if (!marker) throw new Error("annoyed: publication unresolved; missing marker");
    return reconcileAnnoyedIssue(repository, marker, signal, gh);
  };
  let result;
  try { result = await gh(["api", "--method", "POST", endpoint, "--input", "-"], JSON.stringify({ title, body }), signal); }
  catch (error) { if (signal?.aborted) throw new Error("annoyed: cancelled"); return resolveAmbiguous(); }
  if (result.spawnError) return resolveAmbiguous();
  if (result.code !== 0) {
    return resolveAmbiguous();
  }
  let created: any;
  try { created = JSON.parse(result.stdout); } catch { return resolveAmbiguous(); }
  const url = String(created?.html_url ?? "");
  let parsed: URL | undefined; try { parsed = new URL(url); } catch { /* invalid */ }
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "github.com" || parsed.pathname !== `/${repository}/issues/${String(created?.number ?? "")}`) return resolveAmbiguous();
  return url;
}

export function annoyedMarker(): string { return `swarm-annoyed:${randomBytes(16).toString("hex")}`; }
const markerFromBody = (body: string) => body.match(/\*\*Report marker:\*\* `([^`]+)`/)?.[1] ?? "";
const validIssueURL = (url: string, repository: string, number: unknown) => { try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "github.com" && parsed.pathname === `/${repository}/issues/${String(number)}`; } catch { return false; } };

/** tools.NewXML("result").Attr("status","ok").Field(…)[.Attr("severity", …)] — attrs in call order. */
export function annoyedResultXML(issue: string, publicationURL: string, repository: string, severity: string, routing?: { scope?: string; reason?: string; triage?: boolean }): string {
  const attrs = [`status="ok"`, ...(severity ? [`severity=${goQuote(severity)}`] : [])];
  const field = (tag: string, value: string) => `  <${tag}><![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></${tag}>\n`;
  const route = routing ? field("scope", routing.scope ?? "uncertain") + field("reason", routing.reason ?? "") + field("triage", String(routing.triage ?? false)) : "";
  return `<result ${attrs.join(" ")}>\n${field("issue", issue)}${field("publication_url", publicationURL)}${field("repository", repository)}${route}</result>`;
}
