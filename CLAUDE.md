# Pajama Hive

Agent Orchestrator + DAG Visualizer for AI coding agents.

## Quick Reference

```bash
# Install
pnpm install

# Dev
pnpm dev              # all packages
cd packages/api && pnpm dev   # API (wrangler dev)
cd packages/web && pnpm dev   # Frontend (next dev :3000)

# Build
pnpm build

# Typecheck
pnpm typecheck

# Deploy
cd packages/api && npx wrangler deploy       # API → hive-api.pajamadot.com
cd packages/web && npx vercel --prod         # or push to main (auto-deploy)

# Database
cd packages/api && DATABASE_URL="..." pnpm db:generate   # generate migration
cd packages/api && DATABASE_URL="..." pnpm db:migrate    # apply migration

# Rust CLI
cd crates/hive-cli && cargo build --release
cp target/release/hive.exe ../npm/hive-win32-x64/

# Evolver
EVOLVER_REPO_ROOT=$(pwd) EVOLVE_STRATEGY=innovate evolver --loop
```

## Architecture

- **packages/api** — Cloudflare Workers + Hono. Durable Objects: WsRoom (WebSocket), Orchestrator (DAG scheduler), MetaObserverDO (self-awareness). DB: Neon Postgres via Hyperdrive + Drizzle ORM.
- **packages/web** — Next.js 15 + React Flow + shadcn/ui + Clerk auth + xterm.js. Deployed to Vercel.
- **packages/shared** — Zod schemas + TypeScript types shared between api and web.
- **crates/hive-cli** — Rust TUI agent. Published to npm as @pajamadot/hive with platform-specific binaries.
- **npm/** — npm distribution packages for the CLI.
- **assets/gep/** — Evolver GEP assets (genes, capsules, evolution events).

## Conventions

- TypeScript strict mode everywhere
- Drizzle ORM for all database operations (no raw SQL)
- Hono for all API routes with Clerk JWT auth middleware
- Zod for all request/response validation (schemas in packages/shared)
- nanoid for all ID generation
- All WS messages follow the envelope: `{ type, requestId, ts, payload }`
- Task IDs prefixed with `plan-` are agent-generated and need approval
- Graph IDs prefixed with `evolve-` are self-improvement graphs

## Domains

- hive-api.pajamadot.com — API (Cloudflare Workers)
- hive.pajamadot.com — Frontend (Vercel)
- @pajamadot/hive — npm CLI package
