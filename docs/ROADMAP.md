# Pajama Hive Roadmap

## Current State (iteration 99)
- 97% deep parity with Coze Studio
- 98% UX coverage (228/232 actions tested)
- 968 total tests (719 unit + 146 smoke + 103 tab)
- 58 tables, 31 node types, 290+ endpoints, 12 MCP tools
- API live at hive-api.pajamadot.com
- Frontend live at hive.pajamadot.com (Vercel)

## Phase 1: Foundation (NOW)

### P0 — Must Do
- [x] Hyperdrive auto-fallback (fixed)
- [ ] **MCP Server** — Deploy as CF Worker at `mcp.pajamadot.com`
  - Wire SDK methods to MCP tool handlers
  - OAuth token-based auth
  - Test with Claude Desktop
- [ ] **CI/CD Pipeline** — GitHub Actions
  - On push: typecheck + unit tests
  - On PR: smoke test against staging
  - On merge to main: deploy API + frontend
- [ ] **Fix Neon Hyperdrive** — Contact Neon support about c-5 region or migrate DB

### P1 — This Week
- [ ] **Website Redesign** — Linear/Vercel aesthetic
  - Neutral color palette (gray/white, not purple)
  - Sidebar: icons only by default, expand on hover
  - Information-dense tables, not card grids
  - Monospace code blocks, clean typography
- [ ] **CLI Commands** — Wrap SDK in `@pajamadot/hive` CLI
  - `hive login` (OAuth browser flow — already exists)
  - `hive agent create/list/invoke/publish`
  - `hive workflow create/run/list`
  - `hive kb upload/search`
  - `hive chat <agent_id>`
- [ ] **pajama.cc Email** — Set up in Cloudflare dashboard (manual, see scripts/setup-email.md)

## Phase 2: Product Polish

### P1 — Workflow Editor
- [ ] Drag from palette to canvas (not click-to-add)
- [ ] Undo/redo stack
- [ ] Node copy/paste (Ctrl+C/V)
- [ ] Real-time execution status on nodes (green/red border during run)
- [ ] Inline trace viewer (click node after run → see input/output)
- [ ] Variable picker (`{{}}` autocomplete from upstream outputs)
- [ ] Validation indicators (red border on misconfigured nodes)
- [ ] Auto-layout button

### P1 — Chat Experience
- [ ] Regenerate button on assistant messages
- [ ] Thumbs up/down display + submit UI
- [ ] Citation display (source chunks from RAG)
- [ ] Agent reasoning/thought chain display
- [ ] File preview in chat (images, PDFs)
- [ ] Typing indicator during streaming

### P1 — Agent Builder
- [ ] Model selector dropdown (browse configured providers)
- [ ] Knowledge base picker (search + select)
- [ ] Plugin tool picker (browse + enable/disable)
- [ ] Test chat with streaming in preview tab
- [ ] Connector management UI (add web/API/embed channels)

### P2 — Knowledge
- [ ] Drag-and-drop file upload
- [ ] Document processing progress bar
- [ ] Chunk viewer with highlight
- [ ] Re-chunk button with settings

## Phase 3: Competitive Edge

### Differentiators (what Coze/Dify don't have)
- [ ] **MCP-native** — AI tools orchestrate our platform directly
- [ ] **CLI-first** — Every UI action available in terminal
- [ ] **Self-evolving** — Platform improves itself via evolution system
- [ ] **Worker pool** — Distributed agent execution across machines
- [ ] **Cloudflare-native** — No Docker, instant global deployment

### Beyond Parity
- [ ] **Multi-tenant workspaces** — Team collaboration
- [ ] **Billing/usage quotas** — Per-workspace limits
- [ ] **Custom domains for apps** — `bot.customer.com`
- [ ] **Webhook triggers** — Event-driven workflows
- [ ] **Scheduled workflows** — Cron-based execution
- [ ] **API rate limiting per key** — Granular access control
- [ ] **Audit log export** — CSV/JSON download
- [ ] **SSO/SAML** — Enterprise auth

## Phase 4: Scale

- [ ] **Plugin marketplace** — Community-contributed tools
- [ ] **Template gallery** — Pre-built agents/workflows
- [ ] **Analytics dashboard** — Usage, costs, performance
- [ ] **Multi-region** — Deploy to multiple CF regions
- [ ] **SDK packages** — `@pajamadot/hive-sdk` on npm
- [ ] **API docs** — OpenAPI spec + docs site
- [ ] **Mobile app** — React Native chat client
