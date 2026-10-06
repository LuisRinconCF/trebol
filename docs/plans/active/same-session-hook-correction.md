# Same-session correction for blocking hooks

## Scope

User requires all blocking hooks, not a skill-only feature. Every Pi-Swarm-owned
pre-execution block participates in one correction contract, enabled with those
hooks. No automatic execution of an alternative tool, no bypass of permissions,
and no obligation to replay the originally denied tool.

## Inspected contracts

Installed Pi 1.0.4 agent-session.js:682-704 emits native agent_settled and defers
triggered messages sent inside that handler until settlement handlers finish.
:1765-1805 supports custom correction messages triggering a new same-session run.
Nested pi-ai/dist/api/transform-messages.js:159-167 excludes aborted/error assistant
partials from provider replay. These contracts need real outgoing-context proof.
Do not use the local timer-derived onAgentSettled bridge for correction dispatch.

Inventory: central registerHook covers builtin task/completion/skill/sleep/stdin,
disk and structure gates; bootstrap registers directly; autogen package adapter has
its own gate and accounting; nested bootstrap/tool dispatch also invokes registered
hooks. Hook exceptions need explicit failed-closed handling, not guessed repairs.
Third-party extensions returning block outside Pi-Swarm adapters are not observable
as typed decisions through current public API; never infer them from error prose.
Inspect final inventory before claiming complete coverage. If user-owned external
hooks are present, report the uncovered boundary rather than monkeypatch the host.

## Implementation

1. Add shared typed block/correction coordinator with per-session/request/call
   identity, original reason, phase and bounded attempts. Route every owned block
   through it, including direct bootstrap and autogen adapters; preserve priorities,
   disabled groups and nested-call semantics. Keep blocked calls unexecuted.
2. All blocks get explicit same-step correction guidance in their normal error
   result. Argument-dependent/disk hooks run once on complete validated inputs,
   not repeatedly on partial JSON. Existing loop naturally consumes these results.
   Avoid duplicate continuation if a model turn is already queued or correcting.
3. Add pure early-preview contracts where facts suffice: bootstrap/task/skill state
   can deny from tool identity. Refactor shared predicates without duplicating rules
   or charging counters. Do not run disk commands or stateful hooks speculatively.
   Remaining hooks still get the same correction behavior at normal pre-execution.
4. On certain early denial, snapshot call identity, latch once, abort generation.
   Only native settled event may issue bounded same-session corrective context;
   keep aborted history for audit, rely on inspected Pi replay filtering and verify
   payload. No synthetic success/tool results. Explicitly account for whole-response
   cancellation and ask model to reconsider unexecuted siblings.
5. Repeated identical denial without changed arguments/prerequisites must not loop.
   Cap consecutive correction attempts (default three), then report blocker and
   allow user interaction/legitimate recovery. User input, escape/cancel, reload,
   compaction or session replacement invalidate pending automatic continuation.
   Preserve final authoritative gate and authorization regardless of preview.
6. Add bounded non-secret diagnostic entries (phase/IDs/timing, no shell payloads
   or credentials) and concise TUI correction status, not ordinary hook-success
   chatter. Update AGENTS and architecture boundary documentation.

## Verification

E2E only. First real installed Pi scripted-provider transport cases for deterministic
stream/batch/abort/cancellation errors; these do not prove model correction. Then
owned interactive tmux + real provider, same process/session, actual Skill/Bash and
real hook owners, temporary skill/task workspace. Induce harmless wrong choice,
record model fragments, certain denial, aborted settlement, no Bash entry/effect,
actual outgoing correction context and real model-selected alternative. Verify task,
skill, structure, bootstrap and disk blocks separately; include allowed call,
interleaved siblings, repeated denials, cancel/reload, malformed/truncated fragments.
No unit tests, vendor edits or arbitrary third-party interception. Preserve current
footer and unrelated worktree changes. Report incomplete coverage or provider
buffering honestly; full argument buffering may prevent a real early-denial case.

## Approval boundary

This plan is general correction across owned blocking hooks. Early timing is an
optimization only where safe evidence is available, not a promise that every hook
can run on incomplete arguments. Permission failures remain permission failures.
