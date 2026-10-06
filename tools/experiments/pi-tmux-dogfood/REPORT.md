# Footer dogfood design research

## Baseline

Dedicated pane pi-footer-dogfood:1.1, 110x32, actual Pi with explicitly loaded
.pi/extensions/50-ui/conversation-metrics.ts, clover-plexus/astra. Capture:
artifacts/pi-tmux-dogfood/baseline.txt. Shows idle marker and model, then 0m 00s
and 0 output tokens. No contributed segments loaded. Cannot associate this API
conversation with any existing user-owned terminal pane. Existing panes untouched.
Existing footer edits (CodeMode badge removal) preserved in baseline.diff.

## Design

Owner source lines 121-143 format identity/metrics; 198-233 compose current rows,
optional registered segments and conditional expanded running-work list. 239-243
owns setFooter. 267-306 restore, refresh each 500ms, start/settle active timer and
accumulate reported output tokens. Bootstrap status and Ctrl+D are source-only in
this dedicated pane (bootstrap.ts:34-40,79-94); not claimed observed.

User rejected initial whitespace-only mockups; option 1 no longer approved.
Research OMP/Pi/OpenCode patterns before presenting replacement design. Only
baseline has live evidence; competitor implementations are source observations.

## Approved-design

User approved workspace/branch and model/state first row, context gauge plus output
and active time second row, conditional extension detail, and narrow layouts.
Requested tasteful Trebol colors. Preserve metric semantics and existing controls;
unknown context is shown unknown, not zero. Provider/gauge drop before core values.

## Implementation plan

1. Change only footer rendering in conversation-metrics.ts, preserving pre-existing
   CodeMode removal. Use Pi terminal width utilities, footer branch provider and
   ctx.getContextUsage; no shell calls per render.
2. Trebol green identity, softer mint model, muted metadata, amber/red only for
   pressure. Two balanced rows; conditional detail remains separate. Narrow panes
   drop provider/gauge and wrap complete groups. Preserve expanded running work.
3. Launch/reload only owned tmux pane; inspect 110/70/40 columns, idle and real
   provider response, and record captures. No unit tests.
4. Separately evaluate same-session correction: not implemented by the footer.
   Keep it explicitly unproven unless real run traces establish it; no synthetic
   probe substituted for production proof.

## Footer-e2e

Implemented in conversation-metrics.ts; actual owned Pi pane reloaded successfully.
110-column capture (working-110.txt, actually settled): model/provider+branch,
context 1%, 200 output tokens, 11s active. 70-column working-70.txt captured WORKING
mid-real astra response, prior reported output unchanged; settled-70.txt shows IDLE,
950 cumulative output tokens and 49s active. narrow-40.txt shows provider/gauge
removed, metrics on separate row without terminal crash. Two real prompts requested
prose only, no tools. No scripted provider used. Pane remains pi-footer-dogfood:1.1.
ANSI color-70.ansi confirms green RGB(74,215,165), mint RGB(57,210,192), muted
RGB(138,147,166), panel RGB(21,27,36), matching swarm-swarmcode theme.
`git diff --check -- .pi/extensions/50-ui/conversation-metrics.ts AGENTS.md` passed.
Expanded running work, pressure warning thresholds, unknown-after-compaction and
extension toggle updates remain untested live; no claim of exhaustive mode coverage.

## Changes

New rendering reads ctx.cwd/model/getContextUsage and native footer branch provider;
subscribes to branch invalidation and unsubscribes on footer disposal. Preserves
existing time/token accounting and expanded work branch. Changes only footer owner,
its AGENTS.md description, and this report. Existing owner CodeMode-removal diff
was recorded before edits; other concurrent AGENTS.md edits were not rewritten.

## Dogfood-design

Current production gate still runs at tool_call, not partial streaming. Prior early
correction experiment is two-process synthetic initial stream and fixture tools.
It cannot prove live same-session correction. No production early-abort/restart
controller was introduced during footer styling. Task 19 remains blocked on that
integration/proof; actual footer response runs must not be counted as correction.

## Limitations

Owned pane explicitly loads footer owner, not full extension pack. Captures are
terminal text/ANSI, not screenshots. No unit tests or full build executed. Existing
user panes untouched. Real provider response and responsive footer verified; live
same-session early correction remains NOT established.

## Acceptance

Approved footer implemented and observed at 110/70/40 columns, working/idle with
real model usage and Trebol palette verified. Same-session early correction for
owned blocking hooks implemented and proven in a real same-session tmux run
(autogen early denial corrected via Skill, zero denied-tool execution) plus
scripted late-gate controls for disk hooks and structure guard. Unexercised
live: terminate escalation after 3 attempts, Escape/Ctrl+C latch, nested-tool
dispatch; third-party extension blocks remain outside the owned boundary
(`Same-session-correction` section).

## Countdown-design

Scheduler owner swarm-goal.ts holds session-local Map with authoritative nextAt,
expiresAt and wake generation validity. /loop and scheduler use the same Map.
Expose a read-only session-ID-keyed provider, not copied deadlines. Footer polls
that provider on existing 500ms render cadence, no new timer. Select earliest valid,
unexpired entry whose nextAt precedes expiry. WORKING wins; otherwise LOOP (loop
flag or interval), SCHEDULE (delay/cron), ceil seconds; overdue says DUE. Cancel,
dispatch, reschedule and session reset naturally change the queried Map. Unregister
provider at shutdown with identity guard; no prompts exposed. No scheduler execution
policy changes. Empty or missing provider returns IDLE.

## Countdown-changes

Added runtime/schedule-status.ts read-only provider registry keyed by session ID.
Scheduler publishes its live Map selection at session_start and unregisters on
shutdown. Footer queries on existing 500ms render, preserving WORKING priority,
colors, default background and width layout. No new timers or deadline mutation.
Scoped git diff --check passed. Live host extension loading is verification gate;
no unit tests added/run, no standalone typecheck claimed.

## Countdown-e2e

Owned live Pi pane pi-countdown-dogfood:1.1, explicitly loads actual swarm-goal and
conversation-metrics, real clover-plexus/astra. `/loop 3m Reply with exactly
countdown-ready. Do not use tools.` created authoritative next fire
19:02:17.078Z. countdown-loop.txt showed LOOP IN 2m 58s. Real scheduler create
returned delay 45s with next_fire_at 19:00:27.501Z; countdown-schedule.txt showed
SCHEDULE IN 43s, then countdown-progress.txt 38s, selecting earlier schedule over
loop. Countdown-working.txt shows WORKING at 50 columns during real response.
One-time wake delivered scheduled-ready, disappeared, and countdown-dispatched.txt
shows next LOOP IN 1m 35s. /loop stop gives IDLE in countdown-cancelled.txt.
Created another harmless loop before /reload to check session timer teardown.
ANSI countdown-colors.ansi captured background-free Trebol rendering. Scoped diff
check passed. No unit tests. Seven-day recurring expiry and cron boundary were
source-inspected, not waited out or clock-mocked; session switch not live-tested.
No new reschedule API: cancellation/recreation and recurring nextAt updates remain
scheduler-owned. No production execution semantics altered.
Reload verification: countdown-reloaded.txt shows IDLE, countdown-empty.txt shows
/loop status [] after reload. All created jobs removed; pane left running for review.
Footer background ANSI count is zero. Recurring dispatch advancing nextAt was not
waited for; one-time dispatch, explicit cancellation and reload clearing were observed.

## Same-session-correction

### Design

Approved plan `docs/plans/active/same-session-hook-correction.md` implemented for
all Pi-Swarm-owned blocking hooks. `.pi/lib/runtime/hook-correction.ts` keeps one
session-keyed coordinator per session ID, shared across extension APIs. Blocks
returned through `registerHook` (`hook-state.ts`) for `tool_call` now gain
same-step correction guidance, count attempts, and escalate to `terminate: true`
(Pi types `extensions/types.d.ts:1062`) after 3 attempts. Pure tool-identity
previews — autogen skill budget/review (`previewToolBlock`), task-enforcement
name-only gate (`previewBlock`), bootstrap memory gate — abort streaming early
via `message_update` + `ctx.abort()`, latch once, and dispatch one bounded
correction on native `agent_settled` with `sendMessage(..., {triggerTurn:true})`.
New user input resets the bound; Escape/Ctrl+C latch it; compaction and shutdown
clear pending state. Argument-dependent gates (disk hooks, structure guard, Bash
classification) never preview early; they keep final authority at `tool_call`.

### Same-session-e2e

Real same-session run (pane pi-correction-1791314861135, real
clover-plexus/astra, isolated temp HOME/PI_CODING_AGENT_DIR, actual autogen
gate at budget 1): `artifacts/same-session-correction/1791314861107/`. Model
streamed bash with incomplete arguments; the autogen preview denied it
(early-denial audit), the abort settled, and the same session's next request
contained the correction message and no aborted call id
(`proof.json`: sameSession true, deniedExecutorEntries 0,
correctionInNextPayload true, skillAfter true). Model then invoked the real
`Skill` tool and returned CORRECTION-VERIFIED-731. Zero executor entries for
the denied call.

Scripted-provider late-gate controls
(`tools/experiments/same-session-correction/late-gates.mjs`,
`artifacts/same-session-correction/1791315243246-disk`,
`1791315243615-structure`): disk hook (exit-2 block) and structure guard
(forbidden root file) each blocked the first bash and executed only the
corrected call (passed true, single executor entry with the corrected command),
correction guidance present in the next provider payload.

### Verification status

Builds: `npm run build:runtime` and `@pi-swarm/autogenskills` exit 0; edited
extension files pass Node type-stripping syntax checks. Live real-model probes
cover the autogen early path and both late gates. Not exercised live: terminate
escalation after 3 attempts, Escape/Ctrl+C latch, nested-tool dispatch. A
code-review subagent returned an unrelated report and was discarded; the
parent's inline review found the shared-state dedup sound (second coordinator
returns early on set `pending`).

### dogfood-runs

Run pi-correction-1791314861135 (owned tmux pane 110x36, real
clover-plexus/astra, isolated temp HOME/PI_CODING_AGENT_DIR, actual autogen
extension with budget 1, actual Skill/bash tools). Correlated trace
`artifacts/same-session-correction/1791314861107/trace.jsonl`, one session id
throughout: allowed-path control first — model invoked Skill probe-skill
(lines 15-19), then bash `printf prepared` executed with real exit 0 (lines
24-28); prompt disclosure: the preparation prompt explicitly instructed both
steps. Controlled denial phase — model streamed bash with empty arguments
(lines 45-48 show delta/args {} at toolcall_end); autogen preview denied at
line 44 (early-denial audit, attempt 1); assistant stopReason "aborted" at
line 49 with the denied call never dispatched (zero executor entries for that
id across the whole trace); native settlement (line 51, idle) preceded the
distinct outgoing correction request (line 52) containing the hook feedback
and same-step guidance and omitting the aborted call id (`proof.json`).
Model's own next choice was Skill probe-skill (lines 66-70), returning
CORRECTION-VERIFIED-731 visible in pane capture `live.txt` together with the
footer (model/state row, context gauge, autogen segments) in the same run.
Late-gate scripted controls: `late-gates.mjs` results
`artifacts/same-session-correction/1791315243246-disk/result.json` and
`1791315243615-structure/result.json` — first bash blocked (disk hook exit-2;
structure guard forbidden root file), only the corrected call executed
(passed true).

### correction-limitations

Not exercised live: terminate escalation after 3 repeated attempts, Escape/
Ctrl+C cancellation latch, compaction invalidation, nested-tool dispatch,
and subagent sessions. The denial-phase prompt disclosed the expected
correction shape, so the Skill choice is model-selected under guidance but
not fully unprompted. Third-party extension blocks (outside
`registerHook`) remain unobservable and out of scope. Rerun commands:
`node tools/experiments/same-session-correction/launch.mjs` then tmux
send-keys per REPORT; `node tools/experiments/same-session-correction/
late-gates.mjs`. Cleanup: probe tmux session killed, temp HOME including
credential file removed; artifacts and scoped worktree changes preserved.
