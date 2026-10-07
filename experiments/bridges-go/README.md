# Unshipped Go transport prototype

No production application consumer was found in the repository. This is a
library experiment, not infrastructure configuration or a deployable daemon.
It is excluded from the npm build/test workflow. Do not expose it as a service.

Known blockers include missing session ownership authorization, an SSE
replay/subscription race, incomplete WebSocket framing/error handling, and a
control socket that does not dispatch general invocations. These are not fixed
by moving the directory. Its historical Go module identity is retained solely
to avoid an unrelated API change.

Standalone checks: `cd experiments/bridges-go && go test ./...`.
