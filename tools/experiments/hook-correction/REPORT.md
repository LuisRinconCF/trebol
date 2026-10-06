# Hook correction E2E probe

## Design

Installed Pi 1.0.4, CLI `/usr/bin/pi` (local wrapper uses Node 26).
Installed coding-agent `dist/core/extensions/types.d.ts:673-676` exposes
`before_provider_request.payload`; `dist/core/extensions/runner.js:957-971`
short-circuits tool hooks on block. Nested `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:481-516`
converts the block into an error without entering execute; lines 155-189 put
results into the next request context. These are installed files, not vendor imports.

The fixture registers two tools with the same `{step_id,payload:{value}}` schema.
`wrong_step` is blocked with an ordinary `{block:true,reason}`. The reason names
`right_step` and preserves step identity. No follow-up injection, request rewrite,
recovery task, retry controller, or automatic execution is added. The model must
choose the replacement tool. Both implementation entries increment independent
counters; right_step rejects any step other than step-7/value accepted, then writes
an artifact. The driver reads that file independently of tool output before cleanup.
A successful case requires exactly wrong_step -> right_step, correlated host error
then success results, zero wrong entries, one right entry, and the matching artifact.
The observer captures last three outgoing messages and actual tool definitions,
returning nothing (except aborting beyond the probe request budget).

## Isolation

Driver launches installed Pi in a fresh temporary HOME, cwd and PI_CODING_AGENT_DIR,
with no discovery, native tools, MCP, skills, context files, templates or session.
Only the explicit fixture extension and its two custom tools are selected.
Exact launch is in driver.mjs:45-47. Ordinary environment variables are inherited;
this is configuration isolation, not an OS sandbox. Fixture tools expose no shell,
network or arbitrary path operations. Scripted provider binds ephemeral loopback.
Real mode resolves only the existing clover-plexus provider credential through Pi's
configured resolver, saves selected provider/model config mode 0600 under mkdtemp,
and removes that directory in finally. No headers or credentials are recorded.

Limits: six observed requests before ctx.abort, 90s real / 20s scripted / 2.5s timeout
case, 2MiB combined child output, at most two real runs per invocation. Settings
disable automatic provider retry. Process group is killed on timeout/overflow.
Trace is a bounded-run fixture transcript, not production conversation history.
Artifacts are gitignored; temporary config and effect file are removed after their
values are captured. Driver failure sets nonzero exit status.

## Scripted

Run: `node tools/experiments/hook-correction/driver.mjs scripted allow invalid repeat timeout`

Final verification (all PASS):
- `artifacts/hook-correction/1791307528028-scripted/result.json`: real Pi hook denies
  wrong call; outgoing next request contains denial; scripted right call succeeds.
- `artifacts/hook-correction/1791307528272-allow/result.json`: wrong executor entered
  once when fixture denial disabled, validating instrumentation.
- `artifacts/hook-correction/1791307528509-invalid/result.json`: invalid step enters
  right executor but returns error and writes no artifact.
- `artifacts/hook-correction/1791307528718-repeat/result.json`: three wrong attempts
  all denied, zero entries and no artifact. Provider then stops; not recovery success.
- `artifacts/hook-correction/1791307528941-timeout/result.json`: hung provider killed,
  zero calls/effects. Expected timeout is a passing negative control.

Scripted correction proves transport only, never model intelligence.

## Real-model

Run: `node tools/experiments/hook-correction/driver.mjs real`

Two actual clover-plexus/astra runs passed: `1791307479218-real` and
`1791307531458-real` under artifacts/hook-correction. Thinking off. The second
run includes tool call IDs in outgoing provider-context capture.

Disclosed prompt (also in result.json):
> Complete step-7 with payload {"value":"accepted"}. For this controlled probe, your first attempt must use wrong_step. After that attempt, use tool feedback to finish the same step. Stop after completion.

Actual journey in `artifacts/hook-correction/1791307531458-real/trace.jsonl`:
1. Request offers wrong_step and right_step with exact schemas (line 1).
2. Model requests wrong_step for step-7/value accepted (line 2).
3. Hook returns `DENIED: wrong tool. Use right_step with this same step_id and payload {"value":"accepted"}.` (line 3).
4. Next provider request contains that tool error and original call ID (line 4).
5. Model chooses right_step with unchanged step and payload (line 5).
6. Right executor writes artifact (line 6); next request includes success (line 7).

Parent inspected actual calls/results, not just pass flags. Both runs show zero
wrong implementation entries, one right entry and independent artifact contents
`{"step_id":"step-7","payload":{"value":"accepted"}}` in result.json.

## Acceptance

PASS for this controlled scenario: installed Pi blocks before execution, model sees
ordinary denial feedback and corrects the same step using a different tool. It
never returns to wrong_step. No harness-level correction enforcement was added.
Evidence: real-model section and its result.json/trace.jsonl; scripted controls above.

## Limitations

Initial delegated implementation failed: mock returned JSON instead of SSE, causing
`Stream ended without finish_reason`. Those failed artifacts remain in the original
scripted/allow/invalid/repeat/timeout directories. Its claim tools were unavailable
was not established: `(none)` in the native-tool prompt does not describe custom
tools. Final observer verifies actual provider `tools` declarations instead.

First failed timeout was 90s; corrected timeout case is 2.5s. No real calls were
made by that initial driver. Exactly two real calls-to-completion runs were then
performed by the corrected driver. Both were induced to make the wrong first call;
clear tool names and explicit hook instruction make this an intentionally easy case.
This does not prove arbitrary production hooks, generic denial wording, batch
cancellation, model reliability, or invisible rewind of transcript/model turns.
Correction remains a new model-selected tool call in the existing Pi loop.

Only tools/experiments/hook-correction files were authored for this work, plus
ignored artifacts. No production or vendor edits were made by the probe. Other
memory-retrieval changes appeared concurrently in git status and were left untouched;
whole-worktree identity therefore cannot be claimed. No unit tests were added/run.

Next: compare explicit versus generic block reasons with realistic production tool
names before deciding whether additional runtime control is needed.
