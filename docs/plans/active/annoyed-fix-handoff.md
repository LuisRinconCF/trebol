# Annoyed fix handoff

## Changes
- Fixed issue #38 in `packages/tools/taskmanage/src/task-manage.ts`: validation-error decoration now maps only when `operations` is an array; missing/non-array values produce an empty additive `details.batch.results`, leaving the primary validation error intact.
- Issue #37 rollback was not attempted; it was optional and unrelated to the required fix.
- Plan: `docs/plans/active/annoyed-fix-plan.md`.

## Worker and commit
- Worktree: `/home/swarm/Work/worktrees/pi-swarm-annoyed-fixes`; branch `feat/annoyed-triage-fixes-20260930`; base observed at initial inspection: `68f7c66` (branch head itself was not separately recorded before edits).
- Read-only child: `timeout 90s pi -p --no-extensions --no-skills --no-context-files --no-session 'READ ONLY narrow analysis: ...'`; exited 0 in 16.2s, recommended `Array.isArray` guard. No worker edits.
- Commit: `44dbd17b189e18d9655407feeb652328065731ba` (`fix(taskmanage): guard validation error decoration`), parent `68f7c661a11264bbd6c30543a51ebff0da1ef1fc`. It contains only the source fix, plan, and handoff. Final worktree is clean. No push and no GitHub issue operations.

## Verification
- `npm run build -w @pi-swarm/taskmanage` failed in the existing worktree dependency/type environment: missing Node type declarations (`process`, `node:crypto`, `node:fs`, `node:path`) and resulting implicit-any at `src/task-manage.ts:682`. No dependency installation or unrelated type changes attempted.
- `git diff --check` passed after the source change; `git diff HEAD^ HEAD --check` also passed on the committed patch.
- No unit tests were created or run. Manual runtime/E2E validation was not performed; behavior is established by inspection of the guard, not an executed tool call.

## Limitations
- Initial `git status --short --branch` was clean on the requested branch. The commit includes only the implementation, this handoff, and the plan; final `git status --porcelain=v1` was empty.
