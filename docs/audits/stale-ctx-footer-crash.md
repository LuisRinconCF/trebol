# Audit: stale-ctx uncaughtException from MetricsFooter.render after reload

Date: 2026-09-29 · pi 0.87.1 · extension: `extensions/conversation-metrics/extension.ts`

## Observed crash (real records)

Source: `~/.pi/agent/crashes.json` (5 records, all identical signature).
Latest: 2026-09-29T14:05:50.735Z, cwd `/home/swarm/clover`, session
`--home-swarm-clover--/2026-09-29T13-20-10-234Z_01a0ed52-9ff9-7641-81ec-375024013a39.jsonl`.

Stack (byte-verified against installed bundle):

```text
ExtensionRunner.assertActive            chunk-OJP47DM6.js:656:12257
get ui                                  chunk-OJP47DM6.js:656:14246
MetricsFooter.render                    extensions/conversation-metrics/extension.ts:188:19   (pre-fix)
Container.render / VStack.render        chunk-OJP47DM6.js:350:18922, 385:775
layoutComponent -> renderLayoutFrame    chunk-OJP47DM6.js:385
TuiAltScreen.doRender                   chunk-OJP47DM6.js:388:6641
Timeout._onTimeout (scheduleRender)     chunk-OJP47DM6.js:350:31198
```

## Host timeline around the crash (from the session JSONL)

| Time (UTC) | Event |
| --- | --- |
| 14:05:47.575 | `pi-conversation-metrics` `active:true` — agent streaming |
| 14:05:47.576 | assistant message: user cancelled the `ask_user_question` |
| 14:05:48.114 | metrics `active:false` — turn settled |
| 14:05:49.804 | disk-hook audit `agent.stopped` |
| 14:05:50.524 | disk-hook audit `agent.started` — a new run starts 0.7 s later |
| 14:05:50.735 | **uncaughtException, pi exits** — 211 ms into that run |

The reload/quit invalidated the runner while an agent run was restarting; a
TUI render frame scheduled before invalidation fired after it.

## Runtime mechanism (verified in bundle source)

1. `ExtensionRunner.assertActive()` throws `staleMessage`; every ctx getter
   (`get ui`, `get model`, `get sessionManager`, ...) calls it.
2. `AgentSession.reload()`: `session_shutdown` (reason "reload") →
   `oldRunner.invalidate()` → rebuild → new `ExtensionRunner` →
   `session_start` (reason "reload"). `dispose()` (quit/session switch) also
   invalidates.
3. `requestRender()` schedules frames via `setTimeout`; nothing wraps
   component render, so a throw there becomes a process-fatal
   `uncaughtException`. Event-emit handler throws are caught per handler and
   are NOT fatal.

## Extension-side failure chain

1. `shared` lives on `globalThis` (survives `/reload` by design) and stores
   the last event ctx (`shared.ctx = ctx` in `session_start`, `agent_start`,
   `onAgentSettled`).
2. Assigning a stale ctx cannot throw (plain property write), so a ghost
   post-invalidation event poisons `shared.ctx` silently and permanently.
3. Consumers on timers dereference it: the 500 ms `setInterval`
   (`ctx.ui.requestRender`) and each TUI frame (`ctx.model` in
   `renderRows`).
4. Escalation: the footer catch handler's
   `shared.ctx?.ui?.notify?.(...)` (line 188 pre-fix, added in commit
   `1d31a11`) re-threw the stale error inside the frame render. Before
   `1d31a11` the bare `catch { return []; }` swallowed it — which is why the
   crash only started appearing recently.

## Why an idle /reload does not crash

`session_shutdown(reason:"reload")` clears `shared.timer/footer/ctx/pi`, and
the new runner's `session_start` re-populates `shared.ctx` with a fresh ctx.
Two idle-reload repros on the unfixed build (tmux, 2026-09-29) did not crash.
The crash requires the race: reload/quit vs a restarting agent run, or a
frame scheduled before invalidation firing after it.

## Fix (this change) and verification

`ctxAlive()` guard (probe `ctx.ui` in try/catch) applied at every
stale-deref path: footer catch returns `[]` silently when the ctx is dead;
interval drops a poisoned ctx and waits for the next `session_start`;
`agent_start`/settled handlers skip UI work on a dead ctx; `persist()`
swallows stale `appendEntry` so shutdown cleanup cannot be skipped.

Verification: existing `.pi/test/ui/conversation-metrics.test.ts` 8/8 pass;
real-host journey in tmux (agent turn → `/reload` × 2 → `/metrics`) — no
crash, footer segments intact. The user's exact race was not reproduced live;
the guarantee is structural (all stale-deref paths guarded).
