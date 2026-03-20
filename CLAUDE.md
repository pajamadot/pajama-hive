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

# Test
pnpm test             # all packages (vitest)
cd packages/api && pnpm test  # API tests only

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

- **packages/api** — Cloudflare Workers + Hono. Durable Objects: WsRoom (WebSocket), Orchestrator (DAG scheduler), MetaObserverDO (self-awareness). DB: Neon Postgres via Hyperdrive + Drizzle ORM. 61 vitest tests.
- **packages/web** — Next.js 15 + React Flow + shadcn/ui + Clerk auth + xterm.js + sonner toasts + next-themes. Deployed to Vercel.
- **packages/shared** — Zod schemas + TypeScript types shared between api and web.
- **crates/hive-cli** — Rust TUI agent. Published to npm as @pajamadot/hive with platform-specific binaries. Agent kinds: cc (Claude Code), cx (Codex), generic.
- **npm/** — npm distribution packages for the CLI.
- **assets/gep/** — Evolver GEP assets (genes, capsules, evolution events).

## Database Tables

graphs, tasks, edges, runs, workers, audit_logs, meta_events, run_retrospectives, system_snapshots, api_keys, webhooks, graph_snapshots, task_logs

## API Routes

### Graphs
- `GET /v1/graphs` — List (search, status filter, cursor pagination)
- `GET /v1/graphs/stats` — Dashboard aggregate metrics
- `POST /v1/graphs` — Create
- `GET /v1/graphs/:id` — Get (ownership enforced)
- `PATCH /v1/graphs/:id` — Update
- `DELETE /v1/graphs/:id` — Delete
- `POST /v1/graphs/:id/duplicate` — Deep clone
- `POST /v1/graphs/:id/save-template` — Mark as template
- `GET /v1/graphs/templates/list` — List templates
- `GET /v1/graphs/:id/export` — Export as portable JSON
- `POST /v1/graphs/import` — Import from JSON
- `POST /v1/graphs/seed-test` — Create test DAG (lint→typecheck→vitest→codex review)

### Tasks & Edges
- `GET /v1/graphs/:id/tasks` — List tasks
- `POST /v1/graphs/:id/tasks` — Create task
- `POST /v1/graphs/:id/tasks/batch` — Batch approve/cancel/retry
- `PATCH /v1/tasks/:id` — Update task
- `POST /v1/tasks/:id/approve` — Approve (pending → ready)
- `POST /v1/tasks/:id/cancel` — Cancel (notifies worker via WS)
- `POST /v1/tasks/:id/retry` — Retry failed task
- `DELETE /v1/tasks/:id` — Delete task + edges
- `GET /v1/tasks/:id/logs` — Get persisted log chunks (cursor pagination)
- `GET/POST /v1/graphs/:id/edges` — List/create edges (cycle detection)

### Runs
- `POST /v1/graphs/:id/runs` — Create run (captures snapshot, starts orchestrator)
- `GET /v1/graphs/:id/runs` — List runs
- `GET /v1/runs/:id` — Get run status
- `GET /v1/runs/:id/detail` — Get run + tasks + retrospective + snapshot

### Plans
- `POST /v1/graphs/:id/plans` — Submit agent plan (validates, injects tasks)
- `POST /v1/graphs/:id/plans/approve` — Batch approve plan tasks (→ ready)
- `POST /v1/graphs/:id/plans/reject` — Cancel plan tasks

### Meta Observatory
- `GET /v1/meta/events` — List events (cursor pagination, kind/severity/domain filters)
- `POST /v1/meta/events/:id/resolve` — Resolve event
- `GET /v1/meta/retrospectives` — List retrospectives (cursor pagination)
- `GET /v1/meta/health` — Latest health snapshot
- `GET /v1/meta/health/history` — Health history (cursor pagination)

### API Keys & Webhooks
- `GET/POST/DELETE /v1/api-keys` — CRUD (hive_* tokens for CI/CD)
- `GET/POST/DELETE/PATCH /v1/webhooks` — CRUD with HMAC-signed payloads

### Other
- `GET /v1/workers` — List workers
- `GET /v1/audit` — Query audit logs (cursor pagination, action filter)
- `POST /v1/self-improve` — Create evolution task
- `POST /v1/gep/ingest` — Ingest GEP candidates

## Frontend Pages

- `/` — Dashboard (stats, graph list, search, filter, duplicate, seed test)
- `/graph/[id]` — DAG editor (React Flow, node sidebar, detail panel, terminal, workers, export, critical path, keyboard shortcuts, theme toggle)
- `/graph/[id]/runs` — Run history with task breakdown and retrospective
- `/evolution` — Self-improvement lab
- `/meta` — Meta observatory (health, events, retrospectives)
- `/workers` — Worker capacity dashboard (auto-refresh)
- `/audit` — Audit log viewer (filter, pagination)
- `/settings` — API keys and webhooks management

## Conventions

- TypeScript strict mode everywhere
- Drizzle ORM for all database operations (no raw SQL)
- Hono for all API routes with Clerk JWT + API key auth middleware
- Zod for all request/response validation (schemas in packages/shared)
- nanoid for all ID generation
- All WS messages follow the envelope: `{ type, requestId, ts, payload }`
- Task IDs prefixed with `plan-` are agent-generated and need approval
- Graph IDs prefixed with `evolve-` are self-improvement graphs
- Graph ownership verified on all endpoints (403 for non-owners)
- Cursor-based pagination on all list endpoints
- Toast notifications for task/run status changes

## Domains

- hive-api.pajamadot.com — API (Cloudflare Workers)
- hive.pajamadot.com — Frontend (Vercel)
- @pajamadot/hive — npm CLI package
