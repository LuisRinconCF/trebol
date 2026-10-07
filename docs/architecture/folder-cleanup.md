# Folder cleanup: verified boundaries and remaining work

## Implemented

- Local `packages/tools/agents` no longer re-exports experimental daemon adapters.
  A transitive source-import regression test rejects daemon/database/dist coupling.
- Optional worker code and its tests moved to `packages/experimental/absurd-worker`.
  Default build excludes it; explicit experimental build remains available.
  Root workspace installation still installs its dependencies.
- Unconsumed Go bridge moved from infrastructure to `experiments/bridges-go` with
  concrete deployment blockers documented. This does not repair its security bugs.
- Postgres fixture binds loopback; database URL injection and missing daemon
  composition are documented. The integration placeholder always exits 2.
- Production/durability claims corrected: Absurd task persistence does not persist
  the dispatcher's process-local agent/job/index/event metadata.

## Consumer audit / next slices

Repository source search (excluding generated, vendor and dependency trees) found
only unit-test consumers of `createRuntimeProfile`, `SwarmRuntime`, and
`MemoryEventJournal`, and no active imports of `packages/policy/policy`.
These libraries remain for a separate removal/quarantine change; their documentation
now explicitly states that they are not live enforcement/lifecycle boundaries.

The renderer in `runtime/core` IS consumed; do not delete the entire package.
`runtime-contracts` has active RPC consumers mixed with stores and adapters;
splitting it requires symbol-level import and test migration, not a directory rename.
Audit tracked `general-agent.ts/.js/.d.ts` resolution before removing siblings.
Extension-private `.pi/lib` relocation and flattening useful packages remain undone.

## Validation of the first slice

Default and experimental TypeScript builds pass. Full suite: 874 passed, seven
skipped. Real Pi: 53 entries load with zero errors; public surface parity and
session toggle/reload pass. No live Postgres or Go execution is claimed.
