# Annoyed fix handoff

## Changes
- Fixed issue #38 in `packages/tools/taskmanage/src/task-manage.ts`: validation-error decoration now maps only when `operations` is an array; missing/non-array values produce an empty additive `details.batch.results`, leaving the primary validation error intact.
- Issue #37 rollback was not attempted; it was optional and unrelated to the required fix.
- Plan: `docs/plans/active/annoyed-fix-plan.md`.

## Worker and commit
- Worktree: `/home/swarm/Work/worktrees/pi-swarm-annoyed-fixes`; branch `feat/annoyed-triage-fixes-20260930`; base observed at initial inspection: `68f7c66` (branch head itself was not separately recorded before edits).
- Read-only child: `timeout 90s pi -p --no-extensions --no-skills --no-context-files --no-session 'READ ONLY narrow analysis: ...'`; exited 0 in 16.2s, recommended `Array.isArray` guard. No worker edits.
- Initial implementation commit: `3163f0e39f90326f196fd1bc1171c1615dd37589` (`fix(taskmanage): guard validation error decoration`), parent `68f7c661a11264bbd6c30543a51ebff0da1ef1fc`. It contains only the source fix, plan, and handoff. Final worktree is clean. No push and no GitHub issue operations.

## Verification
- `npm run build -w @pi-swarm/taskmanage` failed in the existing worktree dependency/type environment: missing Node type declarations (`process`, `node:crypto`, `node:fs`, `node:path`) and resulting implicit-any at `src/task-manage.ts:682`. No dependency installation or unrelated type changes attempted.
- `git diff --check` passed after the source change; `git diff HEAD^ HEAD --check` also passed on the committed patch.
- No unit tests were created or run. The later registered-tool journey is recorded below; a full Pi-host/TUI journey was not performed.

## Limitations
- Initial `git status --short --branch` was clean on the requested branch. The implementation commit includes only the implementation, this handoff, and the plan; the review-only documentation commit updates the handoff. Final `git status --porcelain=v1` was empty.

## Reconciliation
- Independent git history confirms `3163f0e` is the branch commit after base `68f7c66`; `git diff 68f7c66 HEAD --name-only` showed only the TaskManage source and the two plan/handoff documents. The earlier `44dbd17b...` claim was incorrect, not a second change.

## Journey
- A disposable Bun process loaded this branch's actual `registerTaskManage` tool with in-memory journal and widget adapters, then invoked its registered `execute` entry point. With `operations: {bogus:true}`, `"bad"`, and `null`, each call returned the primary `operations must contain at least one operation` validation error with `details.batch.results: []`; snapshots stayed identical, with zero journal entries and widget updates.
- A subsequent valid create returned `status: succeeded`, task ID `1`, one task in the snapshot, two journal entries, and one widget update. On the starting checkout, the same `{bogus:true}` call instead produced `normalizedParams?.operations?.map is not a function` with no details and no task mutation. This is a registered-tool journey, not a full Pi-host/TUI journey.

## Review
- **Conditional approval for the narrow #38 non-array error-decoration fix:** the before/after registered-tool journey confirms that the validation error is no longer masked and invalid calls do not mutate state. The originally reported intermittent valid six-operation call was not reproduced and could have another cause.
- The scoped build remains blocked by absent Node type declarations in this worktree; an independent retry with a typeRoots override also failed because the referenced types were absent. No unit tests were created or run. Full Pi-host/TUI behavior, provider coercion, and #37 remain unverified.
