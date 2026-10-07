# Optional development Absurd/Postgres fixture

Copy `.env.example` to `.env`, then run:

```sh
docker compose --env-file .env up -d
pg_isready -d "$ABSURD_DATABASE_URL"
```

The first database initialization applies the pinned Absurd 0.5.0-compatible
`absurd.sql` and creates queue `pi-swarm`. Existing Postgres deployments should
apply `absurd.sql` through their migration system and run `select
absurd.create_queue('pi-swarm');`; do not use SQLite. Compose init scripts only
run for a new volume. Pass the connection string explicitly as the experimental worker’s `db`
option; it does not read `ABSURD_DATABASE_URL` automatically. The worker reads
`ABSURD_QUEUE` as its default queue name.

This fixture is not required by normal Pi extensions. No production daemon
assembly or live acceptance suite is provided; `npm run test:integration`
deliberately exits nonzero until real checks exist. Compose binds to loopback
by default. The example credentials are for local development only.
