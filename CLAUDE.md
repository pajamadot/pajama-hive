# Pajama Hive

AI Agent Development Platform — Coze Studio alternative built on Cloudflare + Vercel + Neon.

**See [AGENT.md](./AGENT.md) for full implementation context**, including Coze replication strategy, architecture mapping, domain-by-domain feature tracking, and priority ordering.

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
cd packages/api && DATABASE_URL="$(cat ../../secrets/neondb.env)" pnpm db:push       # push schema
cd packages/api && DATABASE_URL="$(cat ../../secrets/neondb.env)" pnpm db:generate   # generate migration
cd packages/api && DATABASE_URL="$(cat ../../secrets/neondb.env)" pnpm db:migrate    # apply migration

# Rust CLI
cd crates/hive-cli && cargo build --release
cp target/release/hive.exe ../npm/hive-win32-x64/

# Evolver
EVOLVER_REPO_ROOT=$(pwd) EVOLVE_STRATEGY=innovate evolver --loop
```

## Architecture

- **packages/api** — Cloudflare Workers + Hono. Durable Objects: WsRoom, Orchestrator, MetaObserverDO. DB: Neon Postgres (52 tables) via Hyperdrive + Drizzle ORM. Pluggable adapters for search, vector, storage, queue, cache.
- **packages/web** — Next.js 15 + React Flow + shadcn/ui + Clerk auth + xterm.js + sonner toasts + next-themes. Deployed to Vercel.
- **packages/shared** — Zod schemas + TypeScript types shared between api and web.
- **crates/hive-cli** — Rust TUI agent. Published to npm as @pajamadot/hive.
- **reference/coze-studio/** — Coze Studio source for feature parity reference.
- **docs/feature-parity.md** — Coze → Hive feature tracking (75 features across 4 phases).
- **scripts/scaffold-domain.ts** — CLI to scaffold new domain routes/tests/pages.

## Database (52 tables)

**Hive Core**: graphs, tasks, edges, runs, workers, audit_logs, meta_events, run_retrospectives, system_snapshots, api_keys, webhooks, webhook_deliveries, graph_snapshots, task_logs

**Workspaces**: workspaces, workspace_members, user_profiles

**Models**: model_providers, model_configs

**Agents**: agents, agent_versions, agent_configs

**Workflows**: workflow_definitions, workflow_nodes, workflow_edges, workflow_versions, workflow_runs, workflow_traces

**Chat**: conversations, messages, chat_runs, run_steps

**Plugins**: plugins, plugin_tools, plugin_versions

**Knowledge (RAG)**: knowledge_bases, documents, document_chunks

**Data**: user_databases, user_tables, user_table_rows, variables, variable_values, agent_memories

**Prompts**: prompts, prompt_versions

**Apps**: apps, app_versions, app_deployments

**Marketplace**: marketplace_products, marketplace_installs, resources

## API Routes

### Hive Core
- `/v1/graphs/*` — DAG CRUD, export/import, templates, stats
- `/v1/tasks/*`, `/v1/graphs/:id/tasks/*` — Task CRUD, approve, cancel, retry, logs, batch
- `/v1/graphs/:id/edges` — Edge CRUD (cycle detection)
- `/v1/graphs/:id/runs`, `/v1/runs/*` — Run management
- `/v1/graphs/:id/plans/*` — Agent plan submission/approval
- `/v1/meta/*` — Meta observatory (events, retrospectives, health)
- `/v1/api-keys`, `/v1/webhooks` — Auth & webhook CRUD
- `/v1/workers`, `/v1/audit` — Workers & audit logs
- `/v1/ws`, `/v1/graphs/:graphId/ws` — WebSocket

### Coze-Parity (New)
- `/v1/workspaces/*` — Workspace CRUD, members, roles
- `/v1/models/providers/*`, `/v1/models/configs/*` — Multi-provider LLM management
- `/v1/agents/*` — Agent CRUD, config, publish, version, duplicate
- `/v1/workflows/*` — Workflow CRUD, nodes, edges, publish, run, traces
- `/v1/conversations/*` — Conversation CRUD, messages, chat (SSE)
- `/v1/plugins/*` — Plugin CRUD, tools, publish
- `/v1/knowledge/*` — Knowledge base, documents, chunks, search
- `/v1/databases/*` — User database/table/row CRUD
- `/v1/variables/*` — Variables, values, agent memory
- `/v1/prompts/*` — Prompt library, versioning, test
- `/v1/apps/*` — App CRUD, publish, deploy
- `/v1/marketplace/*` — Browse, publish, install

## Frontend Pages

- `/` — Dashboard
- `/graph/[id]` — DAG editor (React Flow)
- `/graph/[id]/runs` — Run history
- `/agents` — Agent list & builder
- `/workflows` — Workflow list & visual editor
- `/playground` — Chat interface
- `/plugins` — Plugin management
- `/knowledge` — Knowledge bases (RAG)
- `/prompts` — Prompt library
- `/apps` — App builder
- `/marketplace` — Community marketplace
- `/evolution` — Self-improvement lab
- `/meta` — Meta observatory
- `/workers` — Worker dashboard
- `/audit` — Audit logs
- `/settings` — API keys & webhooks

## Conventions

- TypeScript strict mode everywhere
- Drizzle ORM for all DB operations (no raw SQL)
- Hono for all API routes with Clerk JWT + API key auth middleware
- Zod for all request/response validation (schemas in packages/shared)
- nanoid for all ID generation
- All WS messages: `{ type, requestId, ts, payload }`
- Draft → Published → Version lifecycle for agents, workflows, plugins, prompts, apps
- Workspace-scoped: all resources belong to a workspace
- Cursor-based pagination on all list endpoints
- Pluggable adapters for external services (search, vector, storage, queue, cache)
- Coze reference code at `reference/coze-studio/` — always check for 1:1 parity

## Domains

- hive-api.pajamadot.com — API (Cloudflare Workers)
- hive.pajamadot.com — Frontend (Vercel)
- @pajamadot/hive — npm CLI package

## Secrets

- `secrets/neondb.env` — Neon Postgres connection string
- `packages/api/.dev.vars` — Clerk keys for local dev
- Cloudflare secrets: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY
