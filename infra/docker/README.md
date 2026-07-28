# Gate 1B PostgreSQL

Gate 1B uses the official `postgres:18` image and binds only to
`127.0.0.1:55432` by default. The native PostgreSQL installation is not part
of the test dependency chain.

```bash
pnpm db:env
pnpm db:up
pnpm db:down
pnpm db:clean
```

`db:env` creates `infra/docker/.env.local` with local random credentials.
That file is ignored by Git. `db:down` keeps the named development volume;
`db:clean` removes the container and volume for a fully reproducible reset.
