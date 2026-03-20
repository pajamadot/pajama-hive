# Pajama Hive — Agent Instructions

## Mission

Replicate **all core features of Coze Studio** (ByteDance's open-source AI agent development platform) 1:1 into Pajama Hive, using our Cloudflare-native + Vercel-native + Neon-native stack. The goal is a production-grade AI agent development platform where Hive agents connect, orchestrate workflows, chat with users, and leverage RAG knowledge bases.

## Source Reference

The Coze Studio source code is available at `reference/coze-studio/` for comparison. Key paths:

| Component | Path |
|-----------|------|
| Go backend (1,013 files) | `reference/coze-studio/backend/` |
| React frontend (9,123+ files) | `reference/coze-studio/frontend/` |
| Thrift IDL API specs | `reference/coze-studio/idl/` |
| Database schema (MySQL) | `reference/coze-studio/docker/volumes/mysql/schema.sql` |
| Docker compose | `reference/coze-studio/docker/docker-compose.yml` |

When implementing a feature, always reference the Coze source to ensure 1:1 behavior parity. Read the corresponding Coze domain code, understand the data model, then implement the Hive equivalent.

## Architecture Mapping

| Coze Studio | Pajama Hive |
|---|---|
| Go + Hertz | Cloudflare Workers + Hono |
| MySQL | Neon Postgres + Drizzle ORM |
| Redis | Cloudflare KV / Durable Objects |
| Elasticsearch | Neon `pg_trgm` + `tsvector` (SearchAdapter) |
| Milvus (vector DB) | Neon `pgvector` (VectorAdapter) |
| MinIO (object storage) | Cloudflare R2 (StorageAdapter) |
| NSQ (message queue) | Cloudflare Queues / DO (QueueAdapter) |
| etcd (config) | Cloudflare KV (CacheAdapter) |
| Docker Compose | Cloudflare Workers (auto-scaled) |
| React + Semi Design | Next.js 15 + shadcn/ui |
| Rush.js monorepo | Turborepo / pnpm workspaces |
| Session-based auth | Clerk JWT + API key auth |

All adapters are pluggable via interfaces in `packages/api/src/lib/adapters/`. Default implementations use Cloudflare/Neon primitives. Swapping to Elasticsearch/Redis/etc is a config change, not a code change.

## Database (52 tables across Neon Postgres)

### Existing (Hive DAG orchestrator)
graphs, tasks, edges, runs, workers, audit_logs, meta_events, run_retrospectives, system_snapshots, api_keys, webhooks, webhook_deliveries, graph_snapshots, task_logs

### Phase 1: Core Platform
workspaces, workspace_members, user_profiles, model_providers, model_configs, agents, agent_versions, agent_configs, workflow_definitions, workflow_nodes, workflow_edges, workflow_versions, workflow_runs, workflow_traces, conversations, messages, chat_runs, run_steps

### Phase 2: Resources & Integrations
plugins, plugin_tools, plugin_versions, knowledge_bases, documents, document_chunks, user_databases, user_tables, user_table_rows, variables, variable_values, agent_memories, prompts, prompt_versions

### Phase 3: Publishing & API
apps, app_versions, app_deployments, marketplace_products, marketplace_installs, resources

## API Routes

### Existing Hive Routes
- `/v1/graphs/*` — DAG graph CRUD, export/import, templates
- `/v1/tasks/*`, `/v1/graphs/:id/tasks/*` — Task CRUD, approve, cancel, retry, logs
- `/v1/graphs/:id/edges` — Edge CRUD with cycle detection
- `/v1/graphs/:id/runs`, `/v1/runs/*` — Run management
- `/v1/graphs/:id/plans/*` — Agent plan submission/approval
- `/v1/meta/*` — Meta observatory (events, retrospectives, health)
- `/v1/api-keys`, `/v1/webhooks` — Auth tokens & webhook CRUD
- `/v1/workers` — Worker listing
- `/v1/audit` — Audit log query
- `/v1/self-improve`, `/v1/gep/ingest` — Evolution system
- `/v1/ws`, `/v1/graphs/:graphId/ws` — WebSocket endpoints

### New Coze-Parity Routes
- `/v1/workspaces/*` — Workspace CRUD, member management
- `/v1/models/providers/*`, `/v1/models/configs/*` — Model provider + config management
- `/v1/agents/*` — Agent CRUD, publish, duplicate, versioning, config
- `/v1/workflows/*` — Workflow CRUD, nodes, edges, publish, run, traces
- `/v1/conversations/*` — Conversation CRUD, messages, chat (SSE streaming)
- `/v1/plugins/*` — Plugin CRUD, tools, publish
- `/v1/knowledge/*` — Knowledge base CRUD, documents, chunks, search
- `/v1/databases/*` — User database/table/row CRUD
- `/v1/variables/*` — Variable CRUD, values, agent memory
- `/v1/prompts/*` — Prompt library CRUD, versioning, test
- `/v1/apps/*` — App CRUD, publish, deploy
- `/v1/marketplace/*` — Browse, publish, install

## Frontend Pages

### Existing
- `/` — Dashboard (stats, graph list)
- `/graph/[id]` — DAG editor (React Flow)
- `/graph/[id]/runs` — Run history
- `/evolution` — Self-improvement lab
- `/meta` — Meta observatory
- `/workers` — Worker dashboard
- `/audit` — Audit logs
- `/settings` — API keys & webhooks

### New Coze-Parity Pages
- `/agents` — Agent list, create, manage
- `/agents/[id]` — Agent builder (persona, skills, knowledge, workflows, preview)
- `/workflows` — Workflow list
- `/workflows/[id]` — Visual workflow editor (node palette, connections, test, trace)
- `/playground` — Chat interface with agent selector
- `/plugins` — Plugin list and builder
- `/plugins/[id]` — Plugin tool definition editor
- `/knowledge` — Knowledge base list
- `/knowledge/[id]` — Document upload, chunk preview, search test
- `/prompts` — Prompt library
- `/apps` — App builder and deployment
- `/marketplace` — Browse/install community resources

## Coze Feature Domains to Replicate

Tracked in `docs/feature-parity.md`. The 17 Coze backend domains map to our routes:

| Coze Domain | Hive Route | Status |
|---|---|---|
| agent / singleagent | `/v1/agents` | Routes + schema done, UI stub |
| workflow | `/v1/workflows` | Routes + schema done, UI stub |
| conversation / message | `/v1/conversations` | Routes + schema done, UI stub |
| knowledge | `/v1/knowledge` | Routes + schema done, UI stub |
| plugin | `/v1/plugins` | Routes + schema done, UI stub |
| memory / database | `/v1/databases`, `/v1/variables` | Routes + schema done |
| prompt | `/v1/prompts` | Routes + schema done, UI stub |
| user / permission | `/v1/workspaces` + Clerk | Routes + schema done |
| app | `/v1/apps` | Routes + schema done, UI stub |
| search | SearchAdapter (pg_trgm) | Interface done |
| upload | StorageAdapter (R2) | Interface done |
| connector | Via plugins | Planned |
| template | `/v1/marketplace` | Routes done |
| openauth | Clerk JWT + API keys | Done |
| datacopy | Not needed | N/A |
| shortcutcmd | Not needed | N/A |

## Implementation Guidelines

### When adding a new feature
1. Read the Coze source for that domain (`reference/coze-studio/backend/domain/<name>/`)
2. Check the IDL spec (`reference/coze-studio/idl/<name>_svc.thrift`)
3. Implement the Hive equivalent using our patterns
4. Update `docs/feature-parity.md` status
5. Run `pnpm typecheck` — must be zero errors

### Code patterns to follow
- **Routes**: See `packages/api/src/routes/agents.ts` for the canonical pattern (Hono + Drizzle + Zod + auth + pagination)
- **Schema**: All tables in `packages/api/src/db/schema.ts`, all Zod schemas in `packages/shared/src/schemas.ts`
- **Frontend**: Use Clerk `useAuth()` + `api` client from `packages/web/src/lib/api.ts`
- **New domains**: Use `scripts/scaffold-domain.ts` to generate stubs, then customize

### Coze-specific behaviors to replicate
- **Draft → Published → Version** lifecycle for agents, workflows, plugins, prompts, apps
- **Snapshot-based versioning**: On publish, capture full state as JSON in `*_versions` tables
- **Workspace scoping**: All resources belong to a workspace; every list query filters by `workspaceId`
- **Chat with SSE streaming**: `/v1/conversations/chat` should stream via Server-Sent Events
- **Workflow node types**: 20+ types matching Coze (start, end, llm, code, condition, loop, variable, http_request, plugin, knowledge_retrieval, message, sub_workflow, database, image_gen, text_processor, intent_detector, variable_assigner, batch, selector, json_transform, qa, emitter, receiver)
- **Plugin system**: Register OpenAPI specs, define tools with input/output schemas, OAuth support
- **Knowledge base RAG**: Document upload → chunk → embed → vector search pipeline
- **Agent memory**: Key-value per-user memory + conversation context window

### Priority order for remaining work
1. **Workflow visual editor** — upgrade React Flow to support all node types
2. **Chat SSE streaming** — real LLM integration via model providers
3. **Agent builder UI** — persona editor, tool attachment, knowledge attachment
4. **Knowledge RAG pipeline** — chunking + embedding + pgvector search
5. **Plugin execution** — actual HTTP calls to plugin tools
6. **App publishing** — deployable chat/workflow apps

## Secrets & Infrastructure

- **Neon DB**: Connection string in `secrets/neondb.env`
- **Cloudflare Hyperdrive**: ID `e5677cabce904563b94921b8838e15d6` in `wrangler.toml`
- **Clerk**: Keys in `packages/api/.dev.vars` and Cloudflare secrets
- **Wrangler**: Authenticated via OAuth (radiantclay@gmail.com)
- **Deploy**: API via `wrangler deploy`, Frontend via Vercel auto-deploy on push to main

## Adapters

Pluggable interfaces in `packages/api/src/lib/adapters/`:

| Adapter | Default | Interface |
|---------|---------|-----------|
| SearchAdapter | Neon pg_trgm + tsvector | `adapters/search.ts` |
| VectorAdapter | Neon pgvector | `adapters/vector.ts` |
| StorageAdapter | Cloudflare R2 | `adapters/storage.ts` |
| QueueAdapter | Durable Objects | `adapters/queue.ts` |
| CacheAdapter | Cloudflare KV | `adapters/cache.ts` |

## Testing

- `pnpm test` — All packages (vitest)
- `pnpm typecheck` — Zero TS errors required
- Target: 200+ tests covering all domains
- Manual test flow: create workspace → create agent → attach workflow + knowledge → chat → publish → deploy as app
