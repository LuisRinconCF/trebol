# Early stream correction probe

## Design

Experimental two-process orchestration, not production integration. Initial Pi
process receives a controlled slow OpenAI-compatible SSE stream. A fixture-only
policy denies tool `Bash` whenever REQUIRE_SKILL=1, independently of every argument.
This is continuation-stable and models the argument-independent production budget
gate (`packages/context/autogenskills/src/index.ts:1090-1117`); it does not invoke
or modify that real gate. `Skill` and `Bash` are harmless instrumented fixture tools.

Installed Pi agent-loop.js:141-153 ends an aborted generation before tool dispatch;
:280-307 exposes tool-call fragments via message_update. ExtensionContext.abort
requests cancellation. The parent requires a captured aborted message, agent_end,
process close and provider connection close before a fresh correction process.
No new request is issued merely because abort was requested. The driver explicitly
reconstructs context as original goal plus a factual correction message, omitting
the abandoned partial call; no fabricated tool results or completed calls are sent.
It is not same-session transcript surgery or a native Pi automatic retry.

State: accumulating -> certain-denial -> abort-requested -> process/stream-settled
-> one corrected model request sequence -> independently verified fixture artifact.
Track phase, content index, tool call ID, raw JSON completeness and implementation
entry counts. A final tool_call veto is defense in depth; target acceptance requires
it never to be needed. Controls exercise allowed Bash, interleaved Inspect/Bash,
ambiguous command text, late tails and a hung stream with no restart.

## Isolation

Only this directory and ignored artifacts/early-stream-correction are written.
Each run uses temporary cwd/HOME/PI_CODING_AGENT_DIR, explicit fixture, no extension
discovery/native tools/MCP/context files/skills/templates/session. Fixture Bash
does not execute shell: it writes a fixed sandbox artifact. Fixture Skill validates
step-7, skill probe-skill and payload accepted before writing its artifact.
Real correction uses existing clover-plexus/astra configuration via Pi credential
resolver, selected provider in private temporary config, removed in finally.
No headers or credentials are captured. Inherited environment means this is not an
OS sandbox. Initial stream is scripted, corrective tool selection is real inference.

Finite process timeouts, output cap, local request cap, one corrective phase per
scenario, bounded real request count and no automatic provider retry. Raw partial
call audit stays local; outgoing request capture is fixture content only.

## Implementation

`fixture.mjs` observes normalized message_update fragments, keeps raw JSON by
content index/call ID, latches one certain denial and calls ctx.abort(). Every
executor increments its counter before effects. Final tool_call denial remains
available, but any late_veto disqualifies the early-correction result.
`driver.mjs` serves a prefix with its last quote/brace withheld for 1000ms; after
process close it allows the late-tail timer to fire before checking settlement.
Only then can it launch the real corrective model. This additional wait is probe
instrumentation, not a proposed latency optimization. Output is capped at 2MiB;
initial/real/hung process limits are 10s/90s/2s. Correction fixture limits observed
requests to four; there is one correction process per denied scenario.

Independent driver reads validate counters and effect file, then temporary files
are removed. Provider payload capture shows the actual correction input and tools.
The scripted initial response is not claimed as a real model's bad choice.

## Runs

Command (all five PASS on first execution):
`node tools/experiments/early-stream-correction/driver.mjs allowed ambiguous timeout denied interleaved`

Artifacts under `artifacts/early-stream-correction/`:
- `1791308508207-allowed`: incomplete prefix -> full args -> Bash entry exactly one,
  expected artifact; no early denial or correction.
- `1791308510516-ambiguous`: command starts `echo Skill` and finishes `echo Skill is
  just text`; no lexical false positive, Bash executes once with policy allowing it.
- `1791308512834-timeout`: hung provider killed at limit; zero tool entries and no
  correction launched. This tests missing settlement fail-closed, not a deliberately
  cancellation-resistant provider after early denial.
- `1791308515954-denied`: trace lines 6-8 show incomplete JSON and certain denial;
  lines 9-13 show connection close, aborted assistant, agent_end and process close;
  lines 14-16 show discarded late tail then verified settlement. Line 18 captures
  new real request, lines 20-21 actual model-selected Skill and executor entry.
- `1791308522615-interleaved`: lines 5-14 show separate Inspect/bash-1 fragments,
  one Bash denial and buffered Inspect delta after abort (no second correction).
  Lines 15-20 settle before restart, line 22 captures real request, lines 24-25
  show actual Skill action. Inspect also does not execute: whole-response abort.

Both corrective phases used clover-plexus/astra, thinking off. Exact prompt is in
driver.mjs and trace launch/provider_request records; it explicitly tells the model
to replace Bash with Skill for step-7. Tools remain available and the response is
not rewritten or scripted. Both independent artifact reads found Skill/step-7/
probe-skill/accepted, counters Bash=0, Skill=1, Inspect=0; no late_veto occurred.
Syntax checks `node --check` passed for both files. Actual traces were read, not
just pass flags. No failed initial runs of this probe were omitted.

## Acceptance

PASS for isolated two-process correction: early denial occurs before argument
completion; installed Pi aborts without tool entry; parent verifies settlement;
real model chooses replacement fixture Skill for the same logical step. Both
allowed controls execute once; timeout never restarts; interleaved identities stay
separate and only Bash causes denial. Whole-response cancellation also drops the
allowed sibling, so selective per-call cancellation is NOT established.

## Limitations

No production changes or unit tests. Speedup and real-provider early cancellation
are not established by a controlled local slow initial stream.
This is a synthetic policy and synthetic Skill/Bash execution, not production
skill-budget enforcement or real shell work. Skill here creates a verification
artifact rather than invoking the skill library. It demonstrates stream control
and model correction mechanics only. Two fresh CLI processes deliberately avoid
same-session history surgery; production context preservation remains untested.
Malformed/re-keyed provider streams, sustained cancellation resistance, real
provider billing/latency and production batch recovery remain unverified. No TUI
inspection. Existing unrelated working-tree edits were preserved.
