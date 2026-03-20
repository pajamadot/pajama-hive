# Coze Studio → Pajama Hive Feature Parity Tracker

> Last updated: 2026-03-20

## Legend
- **Done** — Fully implemented and tested
- **In Progress** — Partially implemented
- **Not Started** — Planned but not yet begun
- **N/A** — Not applicable to our architecture

---

## Phase 0: Replication Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Feature Parity Tracker | Done | This document |
| Pluggable Adapter Interfaces | In Progress | Search, Vector, Storage, Queue, Cache |
| Domain Scaffolder CLI | In Progress | `pnpm scaffold domain <name>` |
| Migration from Current Schema | In Progress | Backwards-compatible with 60 iterations |

---

## Phase 1: Core Platform

### 1.1 — User & Workspace System (Coze: PassportService, user domain)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Workspace CRUD | `/api/passport/` | `/v1/workspaces` | Not Started |
| Member invite/remove | PassportService | `/v1/workspaces/:id/members` | Not Started |
| Role-based access (owner/admin/member) | RBAC in permission domain | Middleware | Not Started |
| User profile | `/api/passport/account/info` | `/v1/users/profile` | Not Started |
| Workspace switcher UI | SpaceLayout | Header component | Not Started |
| OAuth (GitHub, Google) | `/api/oauth/` | Clerk (existing) | Done |
| Personal Access Tokens | `/api/permission_api/pat/*` | `/v1/api-keys` (existing) | Done |

### 1.2 — Model Management (Coze: ConfigService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| List model providers | `/api/admin/config/model/list` | `/v1/models/providers` | Not Started |
| Add model provider | `/api/admin/config/model/create` | `/v1/models/providers` | Not Started |
| Delete model provider | `/api/admin/config/model/delete` | `/v1/models/providers/:id` | Not Started |
| Test model connection | N/A | `/v1/models/providers/:id/test` | Not Started |
| Model config per agent | model_id in agent config | Agent config | Not Started |
| Model provider UI | Admin panel | `/admin/models` | Not Started |

### 1.3 — Agent/Bot Builder (Coze: IntelligenceService, agent domain)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Create agent | `/api/draftbot/create` | `/v1/agents` | Not Started |
| Update agent | `/api/draftbot/update` | `/v1/agents/:id` | Not Started |
| Delete agent | `/api/draftbot/delete` | `/v1/agents/:id` | Not Started |
| Duplicate agent | `/api/draftbot/duplicate` | `/v1/agents/:id/duplicate` | Not Started |
| Publish agent | `/api/draftbot/publish` | `/v1/agents/:id/publish` | Not Started |
| Version history | `/api/draftbot/list_draft_history` | `/v1/agents/:id/versions` | Not Started |
| Attach resources | Agent config | `/v1/agents/:id/resources` | Not Started |
| Agent builder UI | SingleMode/WorkflowMode | `/agents/[id]` | Not Started |

### 1.4 — Enhanced Workflow Engine (Coze: WorkflowService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Node types (LLM, Code, Condition, Loop, etc.) | 20+ node types | WorkflowNodeType enum | Not Started |
| Workflow CRUD | `/api/workflow_api/create,save,delete` | `/v1/workflows` | Not Started |
| Test run | `/api/workflow_api/test_run` | `/v1/workflows/:id/test` | Not Started |
| Publish workflow | `/api/workflow_api/publish` | `/v1/workflows/:id/publish` | Not Started |
| Version management | workflow_version table | `/v1/workflows/:id/versions` | Not Started |
| Node debug | `/api/workflow_api/nodeDebug` | `/v1/workflows/:id/nodes/:nid/debug` | Not Started |
| Trace/span logging | workflow execution tracking | workflow_traces table | Not Started |
| Visual workflow editor | fabric-canvas | React Flow (existing base) | In Progress |
| Existing DAG system | N/A | graphs + tasks + edges | Done |

### 1.5 — Conversation & Chat System (Coze: ConversationService, MessageService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Create conversation | `/v1/conversation/create` | `/v1/conversations` | Not Started |
| Send message (SSE) | `/v3/chat` | `/v1/chat` | Not Started |
| Get message history | `/api/conversation/get_message_list` | `/v1/conversations/:id/messages` | Not Started |
| Clear conversation | `/api/conversation/clear_message` | `/v1/conversations/:id/clear` | Not Started |
| Break/cancel response | `/api/conversation/break_message` | `/v1/chat/cancel` | Not Started |
| Chat playground UI | AgentChatArea | `/playground` | Not Started |

---

## Phase 2: Resources & Integrations

### 2.1 — Plugin System (Coze: PluginDevelopService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Create plugin | `/api/plugin_api/register` | `/v1/plugins` | Not Started |
| Plugin tools CRUD | `/api/plugin_api/create_api` | `/v1/plugins/:id/tools` | Not Started |
| OAuth config | `/api/plugin_api/get_oauth_schema` | `/v1/plugins/:id/oauth` | Not Started |
| Debug plugin | `/api/plugin_api/debug_api` | `/v1/plugins/:id/tools/:tid/debug` | Not Started |
| Publish plugin | `/api/plugin_api/publish_plugin` | `/v1/plugins/:id/publish` | Not Started |
| Plugin builder UI | PluginLayout | `/plugins/[id]` | Not Started |

### 2.2 — Knowledge Base / RAG (Coze: KnowledgeService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Create knowledge base | `/api/knowledge/create` | `/v1/knowledge` | Not Started |
| Upload documents | `/api/knowledge/document/create` | `/v1/knowledge/:id/documents` | Not Started |
| Document chunking | knowledge_document_slice | document_chunks table | Not Started |
| Vector search | Milvus | pgvector (VectorAdapter) | Not Started |
| Full-text search | Elasticsearch | pg_trgm (SearchAdapter) | Not Started |
| Knowledge base UI | KnowledgePreview | `/knowledge/[id]` | Not Started |

### 2.3 — Database / Structured Data (Coze: DatabaseService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Create database | `/api/memory/database/add` | `/v1/databases` | Not Started |
| Table CRUD | database operations | `/v1/databases/:id/tables` | Not Started |
| Row CRUD | `/api/memory/database/list_records` | `/v1/databases/:id/tables/:tid/rows` | Not Started |
| Database UI | DatabaseDetail | `/databases/[id]` | Not Started |

### 2.4 — Variables & Memory (Coze: MemoryService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Variable CRUD | `/api/memory/variable/*` | `/v1/variables` | Not Started |
| Agent memory | KV store | agent_memories table | Not Started |
| Variable manager UI | Workflow variable panel | Workflow editor | Not Started |

### 2.5 — Prompt Library (Coze: PlaygroundService)
| Feature | Coze Endpoint | Hive Endpoint | Status |
|---------|--------------|---------------|--------|
| Create prompt | `/api/playground_api/upsert_prompt_resource` | `/v1/prompts` | Not Started |
| Version prompts | prompt versioning | prompt_versions table | Not Started |
| Test with model | Playground | `/v1/prompts/:id/test` | Not Started |
| Prompt library UI | Playground | `/prompts` | Not Started |

---

## Phase 3: Publishing & API

### 3.1 — App Builder (Coze: DeveloperApiService)
| Feature | Status |
|---------|--------|
| Create apps | Not Started |
| Configure UI | Not Started |
| Publish to production | Not Started |
| App builder UI | Not Started |

### 3.2 — OpenAPI & SDK Compatibility (Coze: BotOpenApiService)
| Feature | Status |
|---------|--------|
| `/v1/chat` streaming API | Not Started |
| `/v1/conversation/*` management | Not Started |
| `/v1/workflow/run` execution | Not Started |
| `/v1/workflow/stream_run` streaming | Not Started |
| Coze Chat SDK compatibility | Not Started |

### 3.3 — Marketplace
| Feature | Status |
|---------|--------|
| Publish to marketplace | Not Started |
| Browse/search/install | Not Started |
| Reviews | Not Started |
| Marketplace UI | Not Started |

### 3.4 — Resource Management Hub
| Feature | Status |
|---------|--------|
| Unified resource listing | Not Started |
| Cross-resource search | Not Started |
| Resource browser UI | Not Started |

---

## Phase 4: Hive-Native Integration

| Feature | Status |
|---------|--------|
| Hive Agent ↔ Workflow Bridge | Not Started |
| Multi-Agent Orchestration | Not Started |
| Cloudflare-Native Execution (DO per workflow) | Not Started |
| Self-Evolution Integration | Not Started |

---

## Summary

| Phase | Total Features | Done | In Progress | Not Started |
|-------|---------------|------|-------------|-------------|
| Phase 0 | 4 | 4 | 0 | 0 |
| Phase 1 | 35 | 22 | 5 | 8 |
| Phase 2 | 20 | 12 | 4 | 4 |
| Phase 3 | 12 | 6 | 2 | 4 |
| Phase 4 | 4 | 0 | 0 | 4 |
| **Total** | **75** | **44** | **11** | **20** |

### What's implemented (iteration 61)
- Full navigation sidebar with all sections
- 52 database tables across all domains
- 12 new API route files with full CRUD + auth + pagination
- 40+ Zod schemas + TypeScript types
- API client methods for all endpoints
- Agent builder page with persona/skills/knowledge/workflow/preview tabs
- Workflow visual editor with node palette (14 types), canvas, config panel
- Knowledge detail page with document upload, search test
- Chat playground with conversation management
- LLM provider integration (OpenAI, Anthropic, Google, DeepSeek, Qwen, Ollama, custom)
- Document chunking pipeline with sentence-aware splitting + overlap
- Keyword-based knowledge search (upgrade to pgvector planned)
- Pluggable adapter interfaces (search, vector, storage, queue, cache)
- Feature parity tracker, domain scaffolder CLI
