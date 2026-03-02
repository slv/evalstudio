# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Evaluator charts on scenario stats page** — New "Evaluators" section in the scenario Stats tab with one chart per evaluator (excluding token-usage, already shown in Trends). Assertions default to green bar charts (pass rate %), metrics default to blue scatter charts (per-run values with red avg line). Chart type is configurable per evaluator via the `chartType` field on `EvaluatorDefinition` (`"line"`, `"bar"`, or `"scatter"`).
- **`chartType` on `EvaluatorDefinition`** — New optional field allows evaluator authors to specify the preferred chart visualization. Exposed via `GET /api/evaluator-types` and read by the web UI.

- **Custom evaluator plugin system** — Declare custom evaluators in `evalstudio.config.json` via the `evaluators` field (relative paths or npm packages). They are automatically loaded at startup by the API server and CLI. Use `defineEvaluator()` to author evaluator modules with assertions (pass/fail gates) or metrics (measurements).
- **`createEvaluatorRegistry()` factory** — New async factory that creates an `EvaluatorRegistry` with built-in evaluators and loads any custom evaluators declared in workspace config. Used by the API server and CLI.
- **Custom evaluators documentation** — New guide covering evaluator authoring, the `EvaluatorContext` API, `isFinal` pattern for final-turn-only evaluators, config-based loading, and npm package distribution.
- **Evaluator test suite** — 41 new tests covering `runEvaluators`, `EvaluatorRegistry`, `defineEvaluator`, config-based loading, and run-processor integration with custom evaluators.

### Changed

- **Renamed criteria evaluation API** — `evaluateCriteria()` → `runLLMJudge()`, `CriteriaEvaluationResult` → `LLMJudgeResult`, `EvaluateCriteriaInput` → `LLMJudgeInput`. Clarifies that this is the LLM-as-judge system, distinct from custom evaluators.
- **`runEvaluators()` returns flat results** — Returns `{ evaluatorResults[], metrics{} }` without aggregate success/score/reason fields. The run processor handles aggregation.
- **Improved error messages for custom evaluator loading** — Suggests `npm install <package>` for missing npm packages, distinguishes built-in vs custom in conflict errors.

## [0.7.0] - 2026-03-02

### Added

- **Agents page with live chat** — Connectors are rebranded as "Agents" in the UI. New dedicated Agents page (`/projects/:id/agents/:agentId`) with entity switcher navigation, a Live Chat tab for real-time conversations with agents (messages recorded as runs with new `chat` status), chat history sidebar to resume previous conversations, and an inline Settings tab for editing all agent configuration fields. Online/offline status indicator polls the connector test endpoint.
- **`chat` run status** — New `RunStatus` value `"chat"` for live chat sessions, separate from automated eval runs. Chat runs are filtered out of the RunList and subject to the orphan runs cap.
- **Chat runs API** — `POST /api/runs/chat` creates a chat run for a connector. `GET /api/runs` supports `status` and `connectorId` query parameters for filtering.
- **Server-managed chat messages** — New `POST /api/runs/:id/chat` endpoint handles the full chat message flow server-side: accepts user message text, invokes the connector, appends messages, persists state, and returns the updated run. Replaces the previous client-managed flow of `POST /connectors/:id/invoke` + `PUT /runs/:id`.
- **CLI run command documentation** — Added `docs/cli/run.md` covering all 6 subcommands: `create`, `list`, `show`, `delete`, `process`, and `playground`

### Changed

- **Connectors settings removed** — The Settings > Connectors page has been removed. All agent/connector management is now consolidated in the Agents page. The old URL (`/settings/connectors`) redirects to `/agents`.
- **ConnectorForm simplified** — The create modal now shows only mandatory fields (name, type, base URL, assistant ID). Optional fields (headers, configurable JSON) are edited via the agent's Settings tab.
- **ToolCall type aligned** — Web `ToolCall` interface now matches the core OpenAI-format type (`{id, type: "function", function: {name, arguments}}`) instead of the previous flat format.
- **Scenario Run button** — Renamed "Playground" to "Run" and changed from green to blue to match the Evals page.

### Removed

- **Connector invoke API** — Removed `POST /api/connectors/:id/invoke` endpoint. Chat messages now go through `POST /api/runs/:id/chat` which handles invoke + persistence in a single request.
- **Client-side chat orchestration** — Removed `useInvokeConnector` hook, `useUpdateRun` hook, and related web API methods (`api.connectors.invoke`, `api.runs.update`). The AgentChat component now uses a single `useSendChatMessage` hook.

### Fixed

- **Documentation accuracy audit** — Verified all docs against actual codebase and fixed inaccuracies across 20 files in core, API, CLI, getting-started, and web sections. Key fixes: updated core docs to module factory pattern, removed fictional entity fields (`input` on evals, `metadata` on runs), fixed connector invoke response shape (`messages` plural), added missing fields (`evaluators` on scenarios, `latencyMs`/`threadId` on runs), corrected API endpoint paths, and updated LLM provider model list

## [0.6.0] - 2026-02-26

### Added

- **Entity switcher navigation** — Clicking Evals, Scenarios, or Personas in the sidebar now navigates directly to the last visited detail page (or the first item) instead of showing a list. A title-styled dropdown lets you switch between entities without leaving the detail view, with text search (when >5 items) and a "+ New" create action. Built with three reusable primitives (`EntitySwitcher`, `EntityRedirect`, `useLastVisited`) so future entities can adopt the same pattern.

### Changed

- **Repository targeted operations** — Extended `Repository<T>` with `findById`, `findBy`, `save`, `saveMany`, `deleteById`, and `maxId` methods. All 6 entity modules (persona, scenario, connector, execution, eval, run) now use single-item operations instead of loading/rewriting entire collections. JSON backend delegates to file read/write; Postgres backend uses single-row SQL (SELECT, UPSERT, DELETE) for massive performance gains — the RunProcessor hot path drops from ~22 `findAll` + 13 `saveAll` per run to ~10 `findById` + ~13 `save`. Also eliminates race conditions between concurrent `findAll`/`saveAll` calls.

### Added

- **Recent eval cards on dashboard** — Dashboard shows up to 4 cards for the most recently executed evals, each displaying key metrics (pass rate donut, runs, latency, tokens) via a shared `ExecutionMetrics` component. Card header links to the eval detail page.
- **`ExecutionMetrics` shared component** — Extracted reusable donut chart + stats grid from `ExecutionSummary`, used by both the full execution summary and the dashboard cards.
- **`useExecutionDataBuilder` hook** — Encapsulates persona/scenario/connector data fetching for building execution summaries, reducing duplication across consumers.
- **Filesystem storage caps** — Executions are capped at 100 (newest kept) and orphan runs (no execution) at 200. When old executions are pruned, their associated runs are cascade-deleted. Pruning runs as a standalone activity in the RunProcessor after all runs finish, keeping write-time logic simple.
- **`pruneProjectData` on StorageProvider** — Optional method for storage backends to implement data retention. Filesystem storage implements execution capping + cascade; Postgres can skip (handled by DB constraints).

### Fixed

- **Postgres JSONB/column sync** — Relational fields (eval_id, scenario_id, etc.) are now stripped from JSONB on write and merged from SQL columns on read. SQL columns are the single source of truth, preventing stale FK references after `ON DELETE SET NULL`.
- **Postgres concurrent saveAll race condition** — Replaced unsafe `DELETE all + INSERT all` pattern with `UPSERT (INSERT ON CONFLICT UPDATE)` + selective `DELETE`, preventing duplicate key violations under concurrent writes.

- **Styleguide modal for persona image generation** — Clicking "Generate Image" on a persona now opens a modal where you can manage style reference images inline (upload, view, delete) before generating. Replaces the buried project-level style reference management in Settings.
- **Image role system** — Images now have a `role` column (`persona-avatar`, `persona-avatar-styleguide`, `upload`) enabling role-based image queries. New `listByRole` API and `GET /api/images?role=` endpoint.
- **Migration logging** — Migrator now logs progress to the console when applying pending migrations.
- **Execution Summary component** — New `ExecutionSummary` component showing pass rate donut chart, stats (runs, avg messages, latency, tokens), scenario breakdown bar chart, and failure details with persona avatars. Includes execution pager for navigating between historical executions.
- **Dashboard eval summaries** — Dashboard now displays an `ExecutionSummary` for each eval, replacing the old Quick Stats and Run Stats cards.
- **Section labels** — Consistent `section-label` styling for "Trends" and "Recent Runs" headings across Eval, Scenario, and Persona detail pages and the Dashboard.
- **Latency scatter chart** — Side-by-side chart layout in Performance Overview: left chart shows pass rate and output tokens; right chart shows individual run latencies as clickable scatter dots with average line. Clicking a dot opens the run messages modal.
- **Evaluator form improvements** — Built-in evaluators displayed with "auto" badge; optional evaluators in a separate section with add/remove support. Section labels use `form-label-row` pattern.
- **Tab state persistence** — Active tab on Scenario, Eval, and Persona detail pages persists via localStorage when navigating between entities of the same type.
- **Chart legend position** — Performance chart legends moved above the charts for better readability.

### Changed

- **Image storage uses roles** — `ImageStore.save()` now requires a `role` parameter; filesystem storage organizes images into role-based subdirectories. Upload API requires `role` in request body.
- **Persona detail page restructured into 3 tabs** — Settings (description, system prompt, image, headers), Stats (performance charts + runs), Code (snippets). Matches the tab layout of Scenario and Eval detail pages.
- **Performance charts split into separate cards** — Pass rate/tokens and latency charts render as two independent cards (62/38 ratio) instead of nested inside a wrapper card, eliminating duplicate borders.
- **Scenario detail page restructured into 3 tabs** — Settings (instructions, criteria, personas, evaluators), Stats (performance chart + runs), Code (snippets)
- **Eval detail page tabs reordered** — Tabs moved into page body (matching Scenario page layout); order changed to Settings, Stats, Code; Stats tab now contains ExecutionSummary, PerformanceChart, and RunList
- **CSS scoping** — `.form-group` label/input styles scoped to direct children to prevent leaking into nested components (persona rows, evaluator cards)
- **Page bottom padding** — Added breathing room at the bottom of detail pages
- **Consolidated EvaluatorResults** — Moved into RunMessagesModal footer; removed DashboardPerformanceChart in favor of unified PerformanceChart

### Removed

- **Dashboard Quick Stats & Run Stats cards** — Replaced by per-eval ExecutionSummary components
- **Dashboard PerformanceChart** — Removed from dashboard; now lives inside Eval detail Stats tab
- **DashboardPerformanceChart** — Replaced by the unified `PerformanceChart` component used across all pages
- **Performance chart time-based view** — Removed "By Time" / "By Execution" toggle; charts now always group by execution ID
- **StyleReferenceManager component** — Removed from Settings page; style reference management now lives in the StyleguideModal accessible from Persona detail page
- **`styleReferenceImageIds` from projects** — Removed from `ProjectConfig`, `ProjectEntry`, API, and database. Image roles replace this field.

---

### Added

- **Output tokens in performance charts** — New amber line showing average output tokens per execution/date in both scenario and dashboard charts
  - Reads token data from `token-usage` evaluator results instead of run-level field
  - Hidden Y-axis with tooltip display (e.g. `1.2k`)

### Changed

- **Token usage moved to evaluator** — Removed `tokensUsage` from `Run` interface; token data now lives exclusively in `token-usage` evaluator results
  - Core: Removed `tokensUsage` from `Run`, `UpdateRunInput`, and `RunProcessor` output
  - API: Removed `tokensUsage` from run update route body
  - Web: `RunList` and performance charts read tokens from `output.evaluatorResults` instead of `run.tokensUsage`
- **Evaluator form cleanup** — Auto evaluators with no config fields (e.g. `token-usage`) are hidden from the scenario form
- **Scenario detail page UX improvements**
  - Failure criteria: select and description moved below textarea
  - Seed messages: empty state is now clickable to add the first message; "Add Message" button only shown when messages exist
  - Success/failure criteria hints displayed inline with labels

### Removed

- `tokensUsage` field from `Run` interface, `UpdateRunInput`, and API run update route

- **Custom evaluator framework** — Pluggable evaluator architecture for assertions and metrics
  - Core: `EvaluatorDefinition` interface with `type`, `kind` (assertion/metric), `auto` flag, `configSchema`, and `evaluate()` function
  - Core: `EvaluatorRegistry` class with `register()`, `get()`, `list()` — holds built-in and custom evaluator definitions
  - Core: `EvaluatorContext` provides full conversation, last invocation data (messages, latency, tokens), turn info to evaluators
  - Core: `runEvaluators()` runs all evaluators in parallel, aggregates results (assertions gate pass/fail, metrics track values)
  - Core: `ScenarioEvaluator` reference type on scenarios — `{ type, config? }` to attach evaluators per scenario
  - Core: `auto` flag on evaluators — auto evaluators always run on every scenario without explicit configuration
  - Core: Built-in `tool-call-count` metric evaluator — counts tool calls per turn with tool name tracking
  - Core: Built-in `token-usage` metric evaluator (auto) — reports input/output/total tokens per turn
  - Core: `defineEvaluator()` helper and `loadCustomEvaluators()` for user-provided evaluator plugins
  - Core: Evaluator results stored on runs as `evaluatorResults[]` and `metrics{}` in output
  - API: `GET /evaluator-types` endpoint listing all registered evaluator types
  - API: `GET /scenarios/:id/evaluators` endpoint for scenario evaluator config
  - CLI: `evaluatorRegistry` injected into `run process` and `run playground` commands
  - Web: `EvaluatorForm` component with auto evaluators (non-removable) and add/remove for optional ones
  - Web: `EvaluatorResults` unified component showing criteria evaluation + custom evaluator results
  - Web: `useEvaluatorTypes` hook for fetching available evaluator types

### Changed

- **RunProcessor refactoring** — Simplified from ~820 to ~460 lines with clearer architecture
  - Extracted `RunContext` interface bundling all resolved dependencies for a run
  - Extracted `LoopState` class tracking invocations, messages, and token usage per run
  - Extracted `resolveRunContext()`, `finalizeRun()`, `ensureInitialUserMessage()`, `generateAndAppendPersonaMessage()` helpers
  - Auto evaluators injected in `resolveRunContext()` before scenario-specific evaluators
- **LangGraph connector** — Improved message handling and tool call normalization
  - Sends message IDs to LangGraph (previously stripped) enabling pure ID-based deduplication
  - Removed `knownMessageCount` count-based dedup in favor of ID-based filtering
  - Normalizes LangGraph tool_call format `{name, args}` to OpenAI format `{id, type: "function", function: {name, arguments}}`
- **Scenario detail page** — Reorganized form layout
  - Moved Max Messages input from Evaluation Criteria to Scenario Setup section with inline layout
  - Evaluator results display unified in single scrollable box (criteria + custom evaluators)
  - Evaluator save fix: empty evaluator arrays now correctly clear stored evaluators

### Removed

- Removed `knownMessageCount` from `ConnectorInvokeInput` and `ConnectorStrategy` interfaces

- **Persona headers** — Optional HTTP headers per persona that merge with connector headers at request time
  - Core: `headers?: Record<string, string>` field on `Persona`, `CreatePersonaInput`, and `UpdatePersonaInput`
  - Core: `extraHeaders` on `ConnectorInvokeInput`, merged last (persona headers take precedence over connector headers)
  - Core: RunProcessor passes persona headers as `extraHeaders` when invoking connectors
  - CLI: `--header <key:value>` option on `persona create` and `persona update` commands
  - API: `headers` field accepted on `POST /personas` and `PUT /personas/:id`
  - Web: Shared `HeadersEditor` component used in both Persona detail and Connector form
  - Web: Improved Persona detail layout with larger image on the right and form fields on the left
  - Web: Confirmation dialog when regenerating an existing persona image
- **Persona images** — Optional AI-generated portrait images for personas
  - Core: `ImageStore` interface on `StorageProvider` — generic blob store with `save(base64, filename?) → id`, `get(id)`, `delete(id)`
  - Core: `imageUrl?: string` field on `Persona` and `UpdatePersonaInput` to reference stored images
  - Core: `styleReferenceImageIds?: string[]` on `ProjectEntry`/`ProjectConfig` for project-level style references
  - Core: `generatePersonaImage()` uses OpenAI `gpt-image-1` — `/v1/images/edits` with style references or `/v1/images/generations` without
  - Core: Filesystem backend stores images as flat files in `{dataDir}/images/`
  - Postgres: `project_images` table with `BYTEA` storage, `style_reference_image_ids TEXT[]` column on projects (migration 002)
  - API: `POST /images` (upload), `GET /images/:id` (serve), `DELETE /images/:id` (remove)
  - API: `POST /personas/:id/generate-image` generates a portrait from persona's system prompt, saves it, and updates `imageUrl`
  - Web: Persona avatars shown in list and detail page, with "Generate Image" button
  - Web: Style Reference Manager in Settings for uploading reference images that define the artistic style

### Changed

- **Connector contract standardization** — Normalized token usage and metadata handling across all connectors
  - Core: Added `TokensUsage` interface with industry-standard field names (`input_tokens`, `output_tokens`, `total_tokens`)
  - Core: Updated `Message.metadata` to single catch-all field consolidating `additional_kwargs` and `response_metadata`
  - Core: Flattened `Run` interface — moved `latencyMs`, `tokensUsage`, `threadId` from nested `metadata` to top-level fields
  - Core: Updated `ConnectorInvokeResult` to include `tokensUsage` and `threadId` metadata
  - Core: LangGraph connector now extracts and normalizes token usage from response
  - API: Updated `UpdateRunBody` to support flattened metadata fields
  - Web: Synchronized type definitions with core flattened structure
  - Removed `RunMetadata` interface (fields now at Run top-level)
- **Connector architecture** — Refactored connector implementation into dedicated folder structure
  - Core: Moved LangGraph strategy from `connector.ts` into new `connectors/langgraph.ts` module
  - Core: Created `connectors/base.ts` with shared `ConnectorStrategy` interface and `buildRequestHeaders()` utility
  - Core: Created `connectors/index.ts` with documentation on how to add new connector types
  - Architecture now clearly shows how to extend with future connector types while keeping only LangGraph available today
- **Eval page scenario list** — Compact rows with search filtering and scrollable container
  - Scenario checkbox rows are thinner with smaller text and tighter padding
  - Search input appears when there are more than 5 scenarios, filtering by name
  - List scrolls when it exceeds max height (18rem)
  - Same improvements applied to the Create/Edit Eval modal
- **Performance charts default to "By Execution" view** across all pages (Dashboard, Eval, Scenario, Persona)
- **Performance charts capped to last 20 data points** to keep charts readable

### Removed

- **HTTP connector** — Removed HTTP connector type from available connector types
  - Core: Removed `HttpConnectorConfig` interface and `httpStrategy` implementation
  - Core: Changed `ConnectorType` from `"http" | "langgraph"` to `"langgraph"` only
  - Core: Removed `HttpConnectorConfig` export from public API
  - CLI: Removed "http" from valid connector types, updated help text to show "langgraph" only
  - Web: Removed HTTP-specific form fields (method, path) from ConnectorForm
  - Web: Changed default connector type to "langgraph"
  - Web: Removed `HttpConnectorConfig` interface from API client types
  - Docs: Removed HTTP connector examples and configuration documentation from all guides
  - Tests: Updated all test cases to use LangGraph connector type with assistantId

## [0.5.0] - 2026-02-20

### Added

- **Database migrations** — Version-stamped SQL migration system for `@evalstudio/postgres`
  - `schema_migrations` table tracks applied migrations with version, name, and timestamp
  - Each migration runs in its own transaction; already-applied migrations are skipped
  - Existing databases upgraded seamlessly — migration 001 uses `IF NOT EXISTS` (no-op on existing tables)
  - `evalstudio db status` CLI command shows applied and pending migrations
- **Deployment documentation** — New Getting Started > Deployment guide and `@evalstudio/postgres` README
  - Step-by-step server project setup with `dotenv-cli` for `.env` file support
  - Dockerfile example for production deployments

### Changed

- **`evalstudio db init` now runs migrations** instead of executing raw SQL — behavior is identical but schema changes are tracked
- **FK delete strategy** — Only project deletion cascades (via `ON DELETE CASCADE`); all other foreign keys use `ON DELETE SET NULL` so any entity can be deleted without blocking
  - Removed code-level cascade delete from `eval.delete()` (no longer deletes associated runs)
  - Removed unused `deleteByEval()` methods from run and execution modules
  - Made `Eval.connectorId`, `Execution.evalId`, and `Run.scenarioId` optional to match nullable DB columns

## [0.4.0] - 2026-02-20

### Added

- **`@evalstudio/postgres` package** — Optional PostgreSQL storage backend for EvalStudio
  - New `@evalstudio/postgres` package with `pg` driver, connection pooling, and JSONB-based entity storage
  - `createPostgresStorage(connectionString)` creates a `StorageProvider` backed by PostgreSQL with eager connection verification
  - `initSchema(connectionString)` creates all tables, indexes, and foreign key constraints
  - Schema: `projects`, `personas`, `scenarios`, `connectors`, `evals`, `executions`, `runs` tables with JSONB `data` columns and reference columns for relational integrity
  - Reference columns (eval_id, scenario_id, persona_id, etc.) duplicated from JSONB for indexing and foreign key constraints
  - Transactional `saveAll()` using BEGIN/COMMIT/ROLLBACK for data consistency
- **`evalstudio db init` CLI command** — Initialize PostgreSQL schema and seed a default project
  - Creates all tables if they don't exist (idempotent, safe to re-run)
  - Creates a "default" project if the database is empty
  - Connection string resolved from: `--connection-string` CLI option → workspace config → `EVALSTUDIO_DATABASE_URL` env var
- **Storage configuration in workspace config** — New `storage` field in `evalstudio.config.json`
  - `StorageType`: `"filesystem"` (default) or `"postgres"`
  - `StorageConfig`: discriminated union with `FilesystemStorageConfig` and `PostgresStorageConfig`
  - `PostgresStorageConfig.connectionString` supports `${VAR}` placeholder syntax for environment variable resolution
  - `resolveConnectionString()` exported from core for CLI/API reuse
- **Storage factory** — `createStorageProvider(workspaceDir)` dynamically selects the backend
  - Reads `storage.type` from workspace config; defaults to filesystem when omitted
  - Dynamically imports `@evalstudio/postgres` only when postgres is configured (optional dependency)
  - Logs `[Storage] Connecting to PostgreSQL...` / `[Storage] PostgreSQL connected` at startup
- **Docker Compose for local development** — `docker-compose.yml` at repository root
  - PostgreSQL 17 Alpine with `--profile postgres` pattern for opt-in dev services
  - Port 5433:5432 to avoid conflicts with local PostgreSQL installations
- **VSCode launch configurations** — "API Server (Postgres)" and "Full Stack Web (Postgres)" configs
  - `preLaunchTask` starts Docker PostgreSQL before launching the API server
  - `.vscode/tasks.json` with "Start PostgreSQL" task

### Changed

- **`createProjectModules()` now uses `StorageProvider`** — Accepts `(storage, projectId)` instead of `ProjectContext`
  - Entity modules are fully decoupled from the filesystem; repositories created via `StorageProvider.createRepository()`
  - All CLI commands, API routes, and tests updated to pass `StorageProvider` + `projectId`
- **`getProjectConfig()` and `updateProjectConfig()` are now async** — Use `StorageProvider` for project entry lookup
  - Filesystem provider reads from workspace config file; Postgres provider queries the `projects` table
  - Update logic (llmSettings merge, apiKey fallback, maxConcurrency validation) moved into `StorageProvider.updateProjectEntry()`
- **`StorageProvider` interface extended** — Added `listProjects()`, `createProject()`, `deleteProject()`, `getProjectEntry()`, `updateProjectEntry()` for full project lifecycle management
  - `FilesystemStorageProvider` implements project operations via workspace config file
  - `PostgresStorageProvider` implements project operations via `projects` table
- **API project routes use `StorageProvider`** — List, create, delete, get/update config all delegate to storage provider
- **CLI project commands use `createStorageProvider()`** — `projects show`, `projects update` resolve storage dynamically

### Changed

- **Consolidated project config** - Removed `project.config.json` in favor of storing all per-project settings in `evalstudio.config.json`
  - Core: Per-project settings (`name`, `llmSettings`, `maxConcurrency`) now stored in `projects[]` array entries in the workspace config
  - Core: Removed `PROJECT_CONFIG_FILENAME` constant, `PerProjectConfig` interface, and `readPerProjectConfig()` function
  - Core: Removed `configPath` field from `ProjectContext` interface
  - Core: Added `ProjectEntry` interface for expanded project entries in workspace config
  - Core: Project directory discovery now uses structural convention (`projects/{uuid}/`) instead of a sentinel file
  - Core: `listProjects()` now strips config fields from project entries to prevent API key leakage

### Security

- **API key redaction** - LLM provider API keys are no longer exposed in API responses or CLI output
  - Core: Added `redactApiKey()` utility that masks keys as `sk-1...cdef` (first 4 + last 4 chars)
  - Core: Update functions now accept omitted `apiKey` to keep the existing stored key
  - API: All config endpoints (`GET/PUT /workspace`, `GET/PUT /projects/:id/config`) return masked keys
  - CLI: `config show --json`, `config set --json`, `llm-provider show --json`, `llm-provider set --json` all redact keys
  - Web: Settings page no longer pre-fills API key from config; placeholder indicates when key is configured

### Added

- **Multi-project workspaces** - Support multiple isolated projects within a single workspace
  - Core: Workspace config (`evalstudio.config.json`) now contains a `projects` registry with UUID-based project entries
  - Core: Per-project config in `projects[]` entries with project-specific LLM and concurrency settings
  - Core: `ProjectContext` passed explicitly to all entity modules (persona, scenario, eval, connector, run, execution)
  - Core: Workspace-level defaults merged with per-project overrides for effective config
  - Core: `resolveProjectFromCwd()` auto-discovers project from current directory or falls back to single-project workspace
  - API: All entity routes scoped under `/api/projects/:projectId/` prefix
  - API: Project CRUD endpoints for create, list, show, update, delete
  - CLI: `evalstudio projects create|list|show|update|delete` commands
  - CLI: All entity commands resolve project from current directory context
  - CLI: `evalstudio init` creates workspace with first project
  - Web: URL-scoped routing (`/projects/:projectId/...`) for all pages
  - Web: Project switcher dropdown in sidebar for navigating between projects
  - Web: Auto-redirect to first project on root URL
  - Tests: All test suites updated with `ProjectContext`-based setup

### Changed

- **Unified LLM settings** - Flattened `llmProvider` and `llmSettings` into a single `llmSettings` object in `evalstudio.config.json`
  - Single config: `llmSettings: { provider, apiKey, models?: { evaluation?, persona? } }`
  - Removed separate `llmProvider` and nested `llmSettings` fields — one object for all LLM configuration
  - CLI: `evalstudio llm-provider set/show/models` reads and writes the unified structure
  - Web: settings page shows unified form — provider + API key section, model configuration appears after provider is saved
  - API: removed CRUD endpoints, kept `GET /llm-providers/models` and `GET /llm-providers/:providerType/models`
- **Model tier grouping** - `getDefaultModels()` now returns `ModelGroup[]` per provider with Standard/Premium tiers
  - New `ModelGroup` type: `{ label: string; models: string[] }` exported from core
  - Web: model select dropdowns render `<optgroup>` sections from API data (no local categorization)
  - CLI: `models` subcommand displays grouped output with tier labels
  - Updated model lists with latest OpenAI (gpt-5.x, o3/o4 series) and Anthropic models
  - Removed `fetchOpenAIModels()` / `fetchProviderModels()` — uses local curated list only
- **Storage provider abstraction** - Introduced `StorageProvider` interface, async `Repository<T>`, and dependency injection for all entity modules
  - Core: `Repository<T>` is now fully async — `findAll()` returns `Promise<T[]>`, `saveAll()` returns `Promise<void>`
  - Core: New `StorageProvider` interface with `createRepository<T>()` factory method for pluggable storage backends
  - Core: `FilesystemStorageProvider` wraps existing JSON file storage behind the new interface
  - Core: Entity module factories now accept injected `Repository<T>` instead of `ProjectContext` (dependency injection)
  - Core: New `createProjectModules(ctx)` helper wires all repositories and modules together with correct dependency order
  - CLI: All commands updated to use `createProjectModules()` with async module calls
  - API: All routes updated to use `createProjectModules()` with async module calls
  - Tests: All test suites updated for async patterns (`await` on module calls, `.rejects.toThrow()` for error assertions)
  - Foundation for Phase 2 PostgreSQL storage backend — swap `StorageProvider` implementation without changing business logic

### Removed

- **LLM provider entity** — removed `data/llm-providers.json` storage file and all CRUD functions
- **LLM provider components** — deleted `LLMProviderForm.tsx` and `LLMProviderList.tsx` from web UI

## [0.3.5] - 2026-02-16

### Added

- **Flexible connector headers** - Connectors now support arbitrary custom headers via a `headers` field
  - Key-value header editor in the web UI for all connector types
  - CLI: `--header <key:value>` repeatable option for create/update commands
  - Headers are sent with every request (test, invoke) and override defaults like `Content-Type`
- **LangGraph configurable** - New `configurable` field on LangGraph connectors
  - Sent as `config.configurable` in invoke request bodies per LangGraph API spec
  - Editable as JSON in the web UI connector form

### Changed

- **HTTP connector form** - Method and path are now dedicated form fields instead of a raw JSON textarea
- **Connector form layout** - Type-specific fields (assistant ID, configurable, method, path) shown contextually

### Removed

- **Unused LangGraph connector fields** - Removed `graphId` and `metadata` from `LangGraphConnectorConfig`
  - These fields were defined in the interface but never sent in API requests
  - Updated web UI connector form to remove references to removed fields
- **Auth type/value fields** - Removed `authType` and `authValue` from connectors, replaced by flexible headers
  - Removed `AuthType` type export from core
  - Auth dropdown and value input removed from web UI and CLI
  - `HttpConnectorConfig.timeout` field removed

## [0.3.4] - 2026-02-13

### Added

- **Configurable max concurrency** - Set max concurrent run executions via project settings
  - New `maxConcurrency` field in `evalstudio.config.json` (validated: must be >= 1)
  - Web UI: Settings > General page with project name and max concurrency controls
  - CLI: `evalstudio config show` and `evalstudio config set maxConcurrency <n>` commands
  - CLI: `run process --concurrency` falls back to project config before defaulting to 3
  - RunProcessor reads from project config when no explicit value is provided
  - Priority chain: explicit option > project config > default (3)

### Changed

- **Documentation cleanup** - Removed all stale references to the old multi-project feature across docs
  - Removed `projectId` from all API endpoint docs (request bodies, query params, response examples)
  - Removed `-p, --project` option from all CLI command docs
  - Rewrote `cli/project.md` to document `evalstudio init` instead of old `evalstudio project` CRUD commands
  - Rewrote `api/projects.md` to document `GET/PUT /api/project` (singular) instead of old CRUD endpoints
  - Removed `description` field from `core/projects.md` (no longer part of the Project interface)
  - Updated `intro.md` package descriptions and feature list
  - Updated `README.md` with current project structure and getting started guide

### Added

- **Scenario seed messages editor** - Visual editor for scenario initial messages in the web UI
  - Chat-like bubble interface matching the run messages display style (user messages right-aligned, assistant left-aligned)
  - Add/remove messages with a single click; roles auto-alternate and can be toggled
  - Auto-growing textareas that resize with content
  - Toggle between Visual (default) and JSON editing modes

### Changed

- **Tool message display** - Refactored tool call/result rendering in run messages UI
  - Tool UI is now driven by `role: "tool"` messages instead of being embedded inside assistant messages
  - `tool_calls` from assistant messages are used only as an input lookup (for tool name and args)
  - Assistant messages with only tool calls (no text) are filtered out, reducing visual clutter
  - Removed unused CSS rules for nested tool call wrappers

### Added

- **CLI README** - Added README.md to `@evalstudio/cli` package with quick start guide, command reference, and development setup instructions

### Changed

- **BREAKING**: Removed `Project` entity and `projectId` from all entities
  - A project is now defined by the presence of `evalstudio.config.json` in a directory (one folder = one project)
  - All entities (persona, scenario, eval, connector, llm-provider, run, execution) no longer carry `projectId`
  - Storage moved from `~/.evalstudio/` global directory to `data/` inside the project directory
  - `EVALSTUDIO_PROJECT_DIR` environment variable to point to a project directory
  - API routes: `/api/projects` replaced with `/api/project` (singular, config-based)
  - CLI: Removed `-p, --project` flag from all commands; commands operate on the current project
  - Web UI: Removed project selector/list; app loads directly into the dashboard
  - RunProcessor gracefully handles missing project (skips tick instead of crashing)
  - Centralized "no project found" error with `ERR_NO_PROJECT` code and helpful message across CLI, API, and web

### Added

- **GitHub Pages deployment** - GitHub Actions workflow to deploy Docusaurus docs automatically
  - Deploys on push to `main` when `packages/docs/**` changes
  - Manual trigger via `workflow_dispatch`
  - Docs available at `https://Treatwell-AI.github.io/evalstudio/`

### Changed

- Updated Docusaurus config for GitHub Pages (`baseUrl: /evalstudio/`, org: `Treatwell-AI`)
- Fixed GitHub repository link in docs navbar

---

## [0.2.0]

### Changed

- **BREAKING**: Renamed core package from `evalstudio` to `@evalstudio/core`
  - All imports updated from `from "evalstudio"` to `from "@evalstudio/core"`
  - Added `publishConfig.access: "public"` for scoped npm publishing
  - All packages now consistently use `@evalstudio/*` scope

---

## [0.1.0]

### Added

- **`evalstudio serve` command** - Single-process server for API + Web UI
  - CLI: New `serve` command with `--port`, `--no-web`, `--no-processor`, `--open` flags
  - CLI: Web UI dist embedded in CLI package via `postbuild` script
  - API: Routes now registered under `/api` prefix for clean coexistence with static files
  - API: Added `@fastify/static` for serving built web assets with SPA fallback
  - API: Added `webDistPath` option to `createServer()` for configurable static file serving
  - Web: Vite dev proxy reads `EVALSTUDIO_PORT` env var for consistent port configuration
  - Build: Turborepo `@evalstudio/cli#build` depends on `@evalstudio/web#build` for correct ordering
  - Works via global install (`evalstudio serve`) and npx (`npx evalstudio serve`)

- **Shared LLM Client** - New `chatCompletion()` utility for direct OpenAI and Anthropic API calls via native `fetch()`
  - Core: Created `llm-client.ts` module with `chatCompletion()`, `getDefaultModelForProvider()`, and related types
  - Core: Handles Anthropic-specific requirements (system message extraction, message alternation, required `max_tokens`)
  - Core: Exported `ChatCompletionMessage`, `ChatCompletionResult`, `ChatCompletionOptions` types for reuse
  - Tests: 14 unit tests covering both providers, error handling, and edge cases

- **`evalstudio init` command** - Initialize a local project directory with isolated storage
  - CLI: `evalstudio init <name>` creates a new directory with `evalstudio.config.json` and `.evalstudio/` data directory
  - Core: `initLocalProject()` function for creating local project structure
  - Core: `discoverLocalStorageDir()` walks up from `cwd` to find `evalstudio.config.json` and use `.evalstudio/` next to it
  - Core: Updated `getStorageDir()` resolution order: `setStorageDir()` → `EVALSTUDIO_STORAGE_DIR` env var → local config discovery → `~/.evalstudio/`
  - Core: Added `storageDir` field to `Status` interface so `evalstudio status` shows active storage path

- **Scenario Import/Export JSONL** - Bulk import and export scenarios in JSONL format
  - Web: Added dots menu on Scenarios page with Export JSONL and Import JSONL actions
  - Web: Export enters select mode with checkboxes, select all/deselect all, and exports selected scenarios as `.jsonl` file
  - Web: Exported fields: `name`, `instructions`, `messages`, `successCriteria`, `failureCriteria`, `failureCriteriaMode`
  - Web: Import reads `.jsonl` file, creates scenarios line by line, and shows a detailed report with per-line success/failure status
  - Web: SVG download/upload icons for menu items

- **Failure Criteria Check Mode** - Choose when failure criteria is evaluated during a run
  - Core: Added `FailureCriteriaMode` type (`"every_turn"` | `"on_max_messages"`) and `failureCriteriaMode` field to `Scenario`, `CreateScenarioInput`, `UpdateScenarioInput`
  - Core: Updated `RunProcessor` evaluation loop to respect mode — `"every_turn"` stops on failure immediately, `"on_max_messages"` (default) only checks failure at end
  - Core: Added `failureCriteriaMode` to `ScenarioSummary` in eval relations
  - API: Updated scenario create/update endpoints to accept `failureCriteriaMode`
  - Web: Added Failure Check Mode select and Max Messages input to Evaluation Criteria section
  - Web: Dynamic recap sentence explains current behavior based on mode + max messages
  - Tests: Added scenario CRUD tests for `failureCriteriaMode`

### Fixed

- **Empty messages save** - Saving an empty messages array on a scenario no longer reverts to the previous value
- **Playground run without seed messages** - Scenarios with no seed messages can now run in the Playground; the run processor generates an initial user message via persona generation
- **Playground run button disabled** - Removed overly restrictive `hasConversationMessages` check that prevented running scenarios without seed messages

### Changed

- **Remove LangChain dependencies** - Evaluator and persona generator now use direct API calls instead of LangChain
  - Core: Rewrote `evaluator.ts` to build messages and call `chatCompletion()` directly
  - Core: Rewrote `persona-generator.ts` to map history messages inline instead of converting to LangChain types
  - Core: Eliminated duplicated `createChatModel()` and `getDefaultModelForProvider()` functions

- **Run list layout** - Fixed-width columns for consistent alignment across rows
  - Reordered columns: execution ID, status, duration, context (with persona), started, menu
  - Context column now flexes to fill available space with CSS text-overflow ellipsis
  - Persona displayed inline in parentheses after context name
  - Removed JS-level truncation in favor of CSS overflow handling
  - Right-aligned started date column

- **Scenario Detail Page Layout** - Reorganized into card-based sections
  - Web: Split form into three `dashboard-card` sections: Scenario Setup, Evaluation Criteria, Personas
  - Web: Consistent layout with Performance Overview card and Runs/Code tabs
  - Web: Unified page spacing using `gap` on `.page` container, removing individual margin-top/margin-bottom from page-level elements across all detail pages (Eval, Scenario, Persona)

### Removed

- **LangChain dependencies** - Removed `@langchain/core`, `@langchain/openai`, `@langchain/anthropic` from core package
  - Eliminates heavy transitive dependency tree (openai SDK, @anthropic-ai/sdk, langsmith, js-tiktoken, etc.)

- **Zod dependency** - Removed `zod` from core package, leaving zero production dependencies
  - Replaced `evaluationResultSchema` Zod schema with a plain `validateEvaluationResult()` function in `evaluator.ts`

- **Unused Connector Field** - Removed `streamMode` from `LangGraphConnectorConfig`
  - Core: Removed field from interface definition
  - Web: Updated ConnectorForm placeholder and hints
  - Docs: Removed streamMode from connector documentation

- **Unused Eval Schema Fields** - Removed `inputSchema`, `outputSchema`, `evaluateOn` from Eval entity
  - Core: Removed fields from `Eval`, `CreateEvalInput`, `UpdateEvalInput` interfaces
  - Core: Simplified `input` type from `Message[] | Record<string, unknown>` to `Message[]`
  - API: Removed fields from eval request/response bodies
  - Web: Removed fields from Eval interfaces
  - Docs: Updated core and API eval documentation

- **BREAKING: I/O Mode** - Removed `ioMode` field entirely, only message-based format is now supported
  - Core: Removed `IoMode` type from `types.ts` and `index.ts` exports
  - Core: Removed `ioMode` field from `Scenario` interface and related functions
  - Core: Simplified eval input to default to empty array `[]`
  - API: Removed `ioMode` from scenario request/response bodies
  - CLI: Removed `--io-mode` option from scenario commands and I/O Mode display from output
  - Web: Removed I/O Mode selector from `ScenarioDetailPage`
  - Web: Updated `ScenarioCodeSnippets` to remove ioMode from examples
  - Docs: Removed all I/O mode references from API, CLI, and core documentation
  - Specs: Removed I/O Mode glossary entry and user stories section

### Changed

- **Floating Status Bar** - Move status info to a floating component at bottom-left of the window
  - Core: `getStatus()` now reads version dynamically from package.json instead of hardcoded value
  - Web: Redesigned `StatusBar` component as a floating element with fixed positioning
  - Web: Displays app version and Node.js version with a colored status indicator dot
  - Web: Moved StatusBar from HomePage to App level so it's visible on all pages including project views
  - Web: Updated tests to use semver pattern matching instead of hardcoded version

- **Performance Chart** - Always show chart visualization even with a single data point
  - Web: Removed stats-only fallback for single data points in `PerformanceChart` component
  - Web: Updated tests to reflect new behavior

- **Execution Grouping** - Replace manual `agentVersion` with automatic `executionId` for grouping runs
  - Core: Added `Execution` entity with auto-incrementing ID per project
  - Core: Added `createExecution()`, `getExecution()`, `listExecutions()` functions
  - Core: Runs now automatically receive `executionId` when created in a batch
  - API: `POST /runs` creates an execution and assigns `executionId` to all runs in the batch
  - API: Removed `agentVersion` parameter from run creation
  - CLI: Removed `--agent-version` option from `run create` command
  - Web: Performance charts "By Execution" mode now groups by `executionId` instead of `agentVersion`
  - Web: RunList displays `executionId` as first column (e.g., "#1", "#2")
  - Web: Simplified performance charts to show only Passed (green line) and Avg Latency (blue line)

### Added

- **Project-Level LLM Configuration** - Configure LLM providers and models at the project level
  - Core: Added `ProjectLLMSettings` interface with `evaluation` and `persona` use-case settings
  - Core: Added `llmSettings` field to Project entity for storing provider/model preferences
  - Core: Added `fetchProviderModels()` to dynamically fetch available models from provider APIs
  - Core: OpenAI models fetched from `/v1/models` endpoint; Anthropic uses static defaults
  - API: Added `GET /llm-providers/:id/models` endpoint for dynamic model fetching
  - API: Added validation for `llmSettings` provider IDs in project update endpoint
  - CLI: Added `project llm-settings show|set|clear` subcommands for managing LLM configuration
  - Web: Added Configuration section to LLM Providers settings page with provider/model selection
  - Web: Dynamic model dropdown populated from provider API when provider is selected
  - Web: Improved LLM provider list with single-row layout and 3-dot action menu

### Changed

- **BREAKING**: Removed `llmProviderId` from Eval entity - LLM configuration now exclusively at project level
  - Core: Removed `llmProviderId` from `Eval`, `CreateEvalInput`, `UpdateEvalInput` interfaces
  - Core: Updated `RunProcessor` to resolve LLM settings from project instead of eval
  - Core: Persona generation uses project persona settings, falling back to evaluation settings
  - API: Removed `llmProviderId` handling from eval and run endpoints
  - CLI: Removed `--llm-provider` option from `eval create` and `eval update` commands
  - Web: Removed LLM Provider dropdown from EvalForm, EvalDetailPage, and ScenarioPlaygroundModal

- **Dashboard Performance Charts** - Overview charts showing pass rates across all evals and personas
  - Web: Created `DashboardPerformanceChart` component for aggregated performance data grouped by eval or persona
  - Web: Dashboard shows dual side-by-side charts: all evals pass rate and all personas pass rate
  - Web: Shared "By Time" / "By Version" toggle controls both charts simultaneously
  - Web: Charts display multiple lines/bars, one per eval or persona with distinct colors
  - Web: Added tests for DashboardPerformanceChart component

- **Consistent Detail Page Layout** - Unified structure across Eval, Scenario, and Persona detail pages
  - Web: Performance Overview card with title and toggle buttons on the right
  - Web: Consistent 1.5rem margins between form, chart, and tabs sections
  - Web: External viewMode control for PerformanceChart component via props

- **Performance Charts** - Visual representation of pass/fail rates and latency trends across runs
  - Web: Created reusable `PerformanceChart` component using Recharts library
  - Web: Added chart to Eval detail page showing pass rate and average latency over time
  - Web: Added chart to Persona detail page for persona-specific performance tracking
  - Web: Added chart to Scenario detail page for scenario-specific performance tracking
  - Web: Single data point displays as stats cards; multiple days show line chart
  - Web: Added comprehensive tests for PerformanceChart component
  - Docs: Updated ARCHITECTURE.md to include Recharts as web package dependency

- **Performance Chart View Modes** - Switch charts between time-based and version-based views
  - Web: Added "By Time" / "By Version" toggle to `PerformanceChart` component
  - Web: Time mode shows line chart grouped by date (default)
  - Web: Version mode shows bar chart grouped by `agentVersion`
  - Web: Toggle only appears when runs have `agentVersion` set
  - Web: Versions sorted using semantic versioning (v1.0.0 < v1.1.0 < v2.0.0)
  - Web: Runs without version grouped as "No Version" at the end

### Changed

- **Shared Run Polling Logic** - Extract common polling and status indicator code from modals
  - Web: Created `usePollingRun` hook that combines `useRun` with automatic polling while run is queued/running
  - Web: Created `RunStatusIndicator` component for consistent "Queued..."/"Running..." status display
  - Web: Refactored `ScenarioPlaygroundModal` and `RunMessagesModal` to use shared abstractions
  - Reduces code duplication (~25 lines) and ensures consistent behavior across modals

### Added

- **Multi-Scenario Evals** - Associate multiple scenarios to an eval for comprehensive test collections
  - Core: Changed `Eval.scenarioId` to `Eval.scenarioIds: string[]` for 1:many relationship
  - Core: `createRuns()` now creates runs for each scenario/persona combination (M scenarios × N personas)
  - Core: Added `getEvalByScenario()` helper to find eval containing a specific scenario
  - Core: `EvalWithRelations.scenarios` now returns array of `ScenarioSummary` objects
  - API: Updated eval endpoints to accept/return `scenarioIds` array
  - CLI: `eval create/update` commands store single scenario as array, display shows scenario count
  - Web: `EvalForm` uses checkbox-based multi-select for scenarios
  - Web: `EvalDetailPage` inline editing with checkboxes for scenario selection
  - Web: `CreateRunDialog` calculates total runs from all scenario/persona combinations with loading state
  - Web: Dashboard `getEvalName()` shows first scenario name + count when multiple

- **Seed Flow Routing** - Detect last seed message sender when executing runs
  - Core: If last seed message is from assistant, generate persona message first before invoking connector
  - Core: Single-turn runs with assistant-ending seeds complete immediately (no connector invocation needed)
  - Enables proper handling of scenarios with seed conversations that end with an agent response

- **Dashboard Recent Runs** - Use reusable RunList component in dashboard for recent runs
  - Web: Added `useRunsByProject` hook with polling support for fetching all project runs
  - Web: Extended `RunList` component with `mode="project"` variant and `limit` prop
  - Web: Replaced custom dashboard runs list with `RunList` component for consistent UI
  - Web: Dashboard now benefits from RunList features: click to view messages, action menu, real-time polling

- **Run Messages Polling** - Real-time updates when viewing running/queued runs
  - Web: `RunMessagesModal` now accepts `runId` and fetches data internally with polling
  - Web: Shows animated "Queued..." or "Running..." status indicator matching ScenarioPlaygroundModal
  - Web: Uses `additionalContent` pattern with `SimulationError` component for consistent error display
  - Web: Automatically polls every 1 second while run is in progress, stops when complete

- **Persona Code Tab** - Add CLI and REST API instructions to persona detail page
  - Web: Created `PersonaCodeSnippets` component with CLI and REST API tabs
  - Web: Added "Runs" and "Code" tab navigation to `PersonaDetailPage`
  - Web: Shows CRUD operations for personas via CLI commands and curl examples

- **Scenario Playground Runs** - Create actual Run entities from Scenario Playground instead of one-shot simulation
  - Core: Made `evalId` optional on Run entity, added `connectorId` and `llmProviderId` fields for playground runs
  - Core: Added `createPlaygroundRun()` function for creating runs without an eval
  - Core: Updated `RunProcessor` to handle playground runs by extracting connector/llmProvider from run instead of eval
  - API: Added `POST /runs/playground` endpoint for creating playground runs
  - Web: Refactored `ScenarioPlaygroundModal` to create runs and poll for status updates
  - Web: Added real-time progress indicator showing queued/running states and new message counts
  - Web: Moved Persona select to same line as Connector and Run button for compact UI
  - Web: LLM provider selection now required when scenario has success/failure criteria

- **Persona Runs List** - View all runs associated with a persona from the persona detail page
  - Core: Added `listRunsByPersona()` function to filter runs by persona ID
  - API: Added `personaId` query parameter to `GET /runs` endpoint
  - Web: Extended `RunList` component to support `personaId` prop alongside existing `evalId` and `scenarioId`
  - Web: Added runs section to `PersonaDetailPage` showing all runs where the persona was used

- **Run List UX Enhancements** - Improved real-time feedback for running evaluations
  - Web: Auto-polling every 2 seconds when runs are queued or running
  - Web: Animated status labels - pulse for "Queued", shimmer for "Running"
  - Web: Live elapsed time counter for running runs (updates every second)
  - Web: Average latency metric in evaluation details (replaces total latency)
  - Core: Track `avgLatencyMs` and `totalLatencyMs` in run output for latency analysis

### Changed

- **Distinguish Failure Types** - Separate system errors from evaluation failures for clearer retry behavior
  - Core: Replaced `"failed"` status with `"error"` for system/server failures (e.g., network errors, API errors)
  - Core: Evaluation failures now use `status: "completed"` with `result.success: false` (not retryable)
  - Core: Updated `retryRun()` to only allow retrying runs with `status: "error"`
  - Web: Added amber/orange styling for `status-error` to visually distinguish from red evaluation failures
  - Web: Retry button now only appears for system errors, not evaluation failures

- **Connector Strategy Pattern** - Refactored connector implementation for extensibility
  - Core: Extracted `ConnectorStrategy` interface with `buildTestRequest`, `buildInvokeRequest`, `parseTestResponse`, `parseInvokeResponse` methods
  - Core: Created `langGraphStrategy` and `httpStrategy` implementations
  - Core: Added `buildAuthHeaders` and `withTiming` utilities to reduce duplication
  - Core: Strategy registry allows easy addition of new connector types

- **LangGraph Thread Organization** - Pass run_id as thread_id when executing runs with LangGraph connector
  - Core: LangGraph connector now creates a thread using the run_id before executing runs
  - Core: Uses `/threads/{thread_id}/runs/wait` endpoint for stateful thread-based execution
  - Core: Added `multitask_strategy: "enqueue"` for proper handling of multi-turn conversations
  - Enables better organization and tracing of evaluation runs in LangSmith

- **Run Evaluation Loop** - Multi-turn conversation testing with automatic criteria evaluation
  - Core: Added `evaluateCriteria()` function using LangChain to evaluate conversations against success/failure criteria
  - Core: Added `generatePersonaMessage()` function to generate realistic user messages (with or without persona)
  - Core: Updated `RunProcessor` to execute evaluation loops - sends messages to agent, evaluates response, generates follow-up messages until success criteria met or max messages reached
  - Core: Added `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, and `zod` dependencies for LLM orchestration
  - Core: Success criteria stops the conversation immediately; failure criteria allows conversation to continue (agent can recover)
  - Core: `retryRun()` now properly clears error, result, and metadata fields when retrying
  - Web: Enhanced `MessagesDisplay` component to show evaluation details (confidence score, message count, latency, criteria status)
  - Web: Updated `RunMessagesModal` to extract and display evaluation results from run output

- Added editable `name` field to Eval entity
  - Core: Added `name: string` (required) to `Eval`, `CreateEvalInput`, `UpdateEvalInput` interfaces
  - API: Added `name` field to create/update request bodies with validation
  - CLI: Added `-n, --name` option to `eval create` (required) and `eval update` commands
  - Web: Added inline editable title to EvalDetailPage (click to edit, Enter to save, Escape to cancel)
  - Web: Added name input field to EvalForm for create/edit
  - Web: EvalList now displays eval name instead of scenario name
  - Docs: Updated API documentation with name field examples
- Added Runs and Code tabs to Scenario detail page
  - Core: Added `scenarioId` to `ListRunsOptions` and `listRunsByScenario()` function
  - API: Added `scenarioId` query parameter support to `GET /runs` endpoint
  - Web: Added `useRunsByScenario` hook for fetching runs by scenario
  - Web: Extended `RunList` component to support both `evalId` and `scenarioId` props
  - Web: Added `ScenarioCodeSnippets` component with CLI and REST API instructions for scenario CRUD
  - Web: Added tab navigation (Runs/Code) to ScenarioDetailPage

### Changed

- **BREAKING**: Removed `personaId` field from Eval entity - personas are now only associated with scenarios
  - Core: Removed `personaId` from `Eval`, `CreateEvalInput`, `UpdateEvalInput`, `EvalWithRelations` interfaces
  - Core: Renamed `getEvalByPersonaAndScenario` to `getEvalByScenario` (persona no longer part of lookup)
  - Core: Removed persona-scenario uniqueness constraint from evals
  - API: Removed `personaId` from eval creation/update request bodies
  - CLI: Removed `--persona` option from `eval create` and `eval update` commands
  - Web: Removed persona dropdown from EvalForm and EvalDetailPage
  - Web: Updated EvalList and DashboardPage to display evals by scenario name only
  - Docs: Updated core, API, and CLI eval documentation

### Removed

- Removed eval preview feature from eval detail page
  - Web: Deleted `EvalPreviewModal` component and Preview button
  - Web: Removed `useEvalPrompt` hook and `api.evals.getPrompt()` function
  - API: Removed `GET /evals/:id/prompt` endpoint
  - Docs: Removed eval prompt endpoint from API documentation

### Added

- Display agent version in run list (Web: RunList component now shows `agentVersion` column)

- Multi-run creation for multi-persona scenarios
  - Core: `createRuns()` function creates one run per persona in `scenario.personaIds`
  - Core: Run model now stores `personaId` and `scenarioId` directly (not fetched from eval at execution time)
  - API: `POST /runs` returns array of created runs
  - CLI: `run create` shows all created runs with persona info
  - CLI: `run list` and `run show` display persona and scenario names
  - Web: CreateRunDialog shows how many runs will be created
  - Web: RunList displays scenario and persona columns, clickable rows to view messages

### Changed

- **BREAKING**: `POST /runs` API now returns `Run[]` instead of `Run`
- Run processor fetches persona/scenario using stored IDs rather than eval relations
- RunList UI: Removed Messages button, entire row is now clickable

- Added Code tab to Eval detail page with execution snippets
  - Web: New "Code" tab alongside "Runs" tab on eval detail page
  - Web: CLI snippets showing `evalstudio run create` and `evalstudio run process` commands
  - Web: REST API snippets with curl commands for creating and managing runs
  - Web: Core package snippets showing programmatic usage with `RunProcessor`
  - Web: Copy-to-clipboard functionality for each snippet
- Added Persona detail page for full-page editing
  - Web: Dedicated detail page at `/project/:projectId/personas/:personaId`
  - Web: Inline editable title (click to edit, Enter to save, Escape to cancel)
  - Web: Form fields for description and system prompt with hints
  - Web: Save/Cancel buttons appear when changes are made
  - Web: Delete action available in page menu
- Simplified persona creation flow
  - Create dialog only asks for name
  - Redirects to detail page where all other fields can be edited
- Made persona rows clickable in list for direct navigation to detail page
- Added multi-persona support for scenarios - associate none, one, or more personas with a scenario
  - Core: Added `personaIds?: string[]` field to `Scenario`, `CreateScenarioInput`, `UpdateScenarioInput`
  - API: Updated `POST /scenarios` and `PUT /scenarios/:id` to accept `personaIds` array
  - CLI: Added `--personas` option to `scenario create` and `scenario update` commands (comma-separated IDs or names)
  - Web: Added persona checkbox list to ScenarioDetailPage for multi-select
  - Personas linked to scenario will be used when running evaluations
- Added Scenario Playground for testing scenarios with personas
  - API: Added `GET /scenarios/:id/prompt` endpoint to build test agent prompt with optional persona
  - Web: Added "Playground" button on scenario detail page
  - Web: ScenarioPlaygroundModal shows system prompt and messages preview
  - Web: Persona selector to switch between associated personas
  - Web: Connector selector and "Run" button to invoke agent and see response

### Changed

- Improved scenario detail page with inline editable title
  - Click on the scenario title to edit it directly (no separate name field in form)
  - Press Enter to save, Escape to cancel changes
  - Fluid input width adjusts to text length

### Changed

- **BREAKING**: Removed `description` field from Eval entity
  - Core: Removed `description` from `Eval`, `CreateEvalInput`, `UpdateEvalInput` interfaces
  - API: Removed `description` from eval creation/update request bodies
  - CLI: Removed `-d, --description` option from `eval create` and `eval update` commands
  - Web: Removed description field from all eval-related components
- Eval detail page now opens directly in edit mode with dropdown selects
  - All fields (Scenario, Persona, Connector, LLM Provider) are editable via dropdowns
  - Save/Cancel buttons appear only when changes are made
  - Shows selected scenario details (max messages, criteria)
  - Two-column layout: Scenario/Persona on left (primary), Connector/LLM Provider on right (secondary)
  - Preview button moved to primary section below Persona
  - Removed I/O mode display from eval UI (still visible on Scenario page)
- Scenario detail page now opens directly in edit mode
  - All fields editable immediately without clicking "Edit"
  - Includes all scenario fields: name, instructions, messages, I/O mode, max messages, criteria
- Simplified scenario creation flow
  - Create dialog only asks for name
  - Redirects to detail page where all other fields can be edited

- **BREAKING**: Moved evaluation configuration from Eval to Scenario level
  - `ioMode`, `maxMessages`, `successCriteria`, and `failureCriteria` are now set on Scenario
  - `scenarioId` is now required when creating an Eval (was optional)
  - Core: Added `ioMode`, `maxMessages`, `successCriteria`, `failureCriteria` to Scenario type
  - Core: Removed these fields from Eval type, made `scenarioId` required
  - Core: `EvalWithRelations.scenario` is now always populated (required relation)
  - API: Updated `POST /scenarios` and `PUT /scenarios/:id` to accept new fields
  - API: Updated `POST /evals` to require `scenarioId`, removed evaluation config fields
  - CLI: Added `--io-mode`, `--max-messages`, `--success-criteria`, `--failure-criteria` to `scenario create/update`
  - CLI: Made `--scenario` required in `eval create`, removed mode/criteria options
  - Web: ScenarioForm now includes I/O mode, max messages, and criteria fields
  - Web: EvalForm simplified - scenario selection required, removed moved fields
  - Web: EvalDetailPage and EvalList now display criteria from scenario relation

### Added

- Added agent version tracking to runs for identifying which agent version was tested
  - Core: Added `agentVersion?: string` field to `Run` and `CreateRunInput` types
  - API: Updated `POST /runs` to accept optional `agentVersion` parameter
  - Web: Added agent version input field to CreateRunDialog
  - Web: Display agent version in run list and dashboard recent runs
- Added run messages modal for viewing full conversation history
  - Web: New `RunMessagesModal` component shows all messages from a run in a modal
  - Web: Collapsible system prompt section (collapsed by default)
  - Web: Shows result (passed/failed) and error information
- Store all messages including system prompt in each run
  - Core: RunProcessor now builds and stores all messages (system prompt + seed messages + input) before execution
  - Core: Messages are stored in the run for visibility in the UI before the connector is invoked

### Changed

- Moved preview functionality from Run level to Eval level
  - Web: New `EvalPreviewModal` replaces `RunPreviewModal` at the Eval level
  - Web: Preview is now accessible from Eval detail page menu (not from Run actions)
  - Web: Removed "Save response to run" option (preview is for testing, not persistence)
- Refactored run list UI for better information display
  - Web: Run list now shows: agentVersion, status, startedAt, duration, and Messages button
  - Web: Click "Messages" to open modal showing full conversation
- Extracted shared `MessagesDisplay` component for consistent message rendering
  - Web: Both `EvalPreviewModal` and `RunMessagesModal` use the same component
  - Web: Includes `ToolCallsDisplay`, `SimulatedMessage`, and `SimulationError` helpers

### Changed

- **BREAKING**: Moved connector and LLM provider configuration from Run to Eval level
  - Connector is now required when creating an Eval (enforced at creation time)
  - LLM Provider is optional at Eval level for evaluation judging
  - Runs no longer accept connector/LLM provider overrides - they use the Eval's settings
  - Core: Added `connectorId` (required) and `llmProviderId` (optional) fields to `Eval` type
  - Core: Removed `connectorId`, `llmProviderId`, and `model` fields from `Run` type
  - Core: Updated `RunProcessor` to get connector from Eval instead of Run
  - CLI: Added `--connector` (required) and `--llm-provider` options to `eval create`
  - CLI: Removed `--connector` option from `run create`
  - API: Updated `POST /evals` to require `connectorId`, accept optional `llmProviderId`
  - API: Simplified `POST /runs` to only require `evalId`
  - Web: Added connector and LLM provider selection to Eval form
  - Web: Simplified Run creation dialog (no longer shows connector/LLM selection)

### Added

- Added retry functionality for failed runs
  - Core: `retryRun()` function to reset failed runs to "queued" status for re-execution
  - Core: Clears error, timing, and result data; optionally clears messages with `clearMessages` option
  - API: `POST /runs/:id/retry` endpoint to trigger retry via REST
  - Web: Added "Retry" button in run action menu (only shown for failed runs)
  - Web: `useRetryRun` hook with automatic query invalidation for UI refresh
- Added RunProcessor for background execution of queued evaluation runs
  - Core: `RunProcessor` class with start/stop lifecycle, polling, and concurrent execution
  - Core: Configurable `pollIntervalMs`, `maxConcurrent`, and optional `projectId` filtering
  - Core: Callbacks for monitoring: `onStatusChange`, `onRunStart`, `onRunComplete`, `onRunError`
  - Core: `processOnce()` method for one-shot processing (useful for CLI/testing)
  - Core: Crash recovery - resets "running" runs to "queued" on start
  - Core: Atomic claiming prevents duplicate processing across multiple processor instances
  - Core: Enhanced `listRuns()` with options-based API supporting `status`, `projectId`, and `limit` filters
  - Docs: Updated runs documentation with RunProcessor usage examples
- Added full LangGraph message support for complete agent responses
  - Core: Extended `Message` type with LangGraph fields (`tool_calls`, `additional_kwargs`, `response_metadata`, `id`, `name`, `tool_call_id`)
  - Core: Added `ContentBlock` and `ToolCall` types to support multi-part content and tool invocations
  - Core: Added `getMessageContentAsString` helper for normalizing message content
  - Web: Added `getMessageContent` helper and `ToolCallsDisplay` component for rendering tool calls
  - Web: Run preview modal now displays tool calls with name and arguments
- Added connector invoke functionality for sending messages to agents
  - Core: `invokeConnector` function to send messages and receive assistant responses
  - Core: `ConnectorInvokeInput` and `ConnectorInvokeResult` types for structured invoke operations
  - API: `POST /connectors/:id/invoke` endpoint for invoking connectors with messages
  - Web: "Send to Agent" button in run preview modal to test conversations
  - Web: Option to persist agent responses back to the run
  - Web: Raw response display in error messages for debugging connector issues
- Added initial messages support to scenarios for conversation seeding
  - Core: Added `messages?: Message[]` field to `Scenario`, `CreateScenarioInput`, `UpdateScenarioInput`
  - Core: Moved `Message` and `IoMode` types to shared `types.ts` to avoid circular dependencies
  - CLI: Added `-m, --messages-file` option to `scenario create` and `scenario update` commands
  - API: Updated `POST /scenarios` and `PUT /scenarios/:id` to accept `messages` array
  - Web: Added messages JSON editor to ScenarioForm and ScenarioDetailPage
  - Web: Display initial messages in scenario detail view with role-based styling
  - Docs: Updated core, API, and CLI scenario documentation
- Added run preview modal showing test agent system prompt and messages in OpenAI format
  - Core: `buildTestAgentSystemPrompt` and `buildTestAgentMessages` functions for generating test agent prompts
  - Core: System prompt includes persona character instructions, scenario context, and behavioral guidelines
  - API: `GET /evals/:id/prompt` endpoint for retrieving the generated test agent system prompt
  - Web: Run preview modal accessible from run list dots menu showing full message chain
  - Web: `useEvalPrompt` hook for fetching prompts via API (no logic duplication in frontend)
  - Web: Chat-like message layout with assistant messages on left, user messages on right
  - Web: Collapsible system prompt section with max-height and expand/collapse functionality
- Added run creation from eval detail page with runtime configuration
  - Core: Added "queued" status to `RunStatus` type for runs awaiting execution
  - Core: Added `model` field to `Run` entity for specifying which LLM model to use
  - API: Updated `POST /runs` to accept `model` parameter
  - Web: New "Create Run" dialog on eval detail page with connector, LLM provider, and model selection
  - Web: Model dropdown dynamically populated based on selected LLM provider
- Added actions menu to eval detail page header with Edit and Delete options
- Added real-time stats to Dashboard page
  - Quick Stats: Shows actual counts for Evals, Scenarios, and Personas
  - Run Stats: Shows Queued, Passed, and Failed run counts
  - Configuration: Shows Connectors and LLM Providers counts
  - Recent Evals: Lists last 5 evals with clickable links
  - Recent Runs: Lists last 5 runs with status badges

### Changed

- Changed LangGraph connector to use `/runs/wait` endpoint for reliable response handling
  - Waits for run completion before returning (fixes "pending" status issue)
  - Response is now direct JSON instead of NDJSON stream
  - Preserves full message structure including tool calls and metadata
- **BREAKING**: Simplified Scenario entity - replaced multiple fields with single `instructions` field
  - Scenario now has: `name`, `instructions` (consolidated context for LLM)
  - Core: Removed `description`, `customerIssue`, `contactReason`, `backgroundInfo` from `Scenario` interfaces
  - CLI: Replaced `-d, --description`, `--customer-issue`, `--contact-reason`, `--background-info` with `-i, --instructions`
  - API: Updated request/response bodies to use `instructions` only
  - Web: Updated ScenarioForm, ScenarioList, and added ScenarioDetailPage for full-page editing
  - Docs: Updated core, API, and CLI scenario documentation
- **BREAKING**: Simplified Persona entity - removed `traits` field
  - Persona now has: `name`, `description` (short), `systemPrompt` (full description for LLM)
  - Core: Removed `traits` from `Persona`, `CreatePersonaInput`, `UpdatePersonaInput` interfaces
  - CLI: Removed `-t, --traits` option from `persona create` and `persona update` commands
  - API: Removed `traits` from request/response bodies
  - Web: Updated PersonaForm and PersonaList components
  - Docs: Updated core, API, and CLI persona documentation
- Improved persona list UI with compact single-line layout
  - Each persona displays name and description on one row
  - Replaced Edit and Delete buttons with dots menu
- Improved run list UI with compact single-line layout
  - Each run displays status, date, and config tags (connector, LLM provider, model) on one row
  - Replaced delete button with dots menu for cleaner appearance
- Made eval cards fully clickable in list view for easier navigation
  - Removed View, Edit, and Delete buttons from eval list
  - Edit and Delete actions moved to detail page dots menu

- Added Eval detail page for viewing eval settings and run history
  - Core: New `Run` entity with `createRun`, `getRun`, `listRuns`, `listRunsByEval`, `updateRun`, `deleteRun`, `deleteRunsByEval`, `deleteRunsByProject`
  - API: REST endpoints `GET/POST /runs`, `GET/PUT/DELETE /runs/:id` with evalId and projectId filtering
  - Web: Dedicated eval detail page at `/project/:projectId/evals/:evalId` showing:
    - Eval settings (persona, scenario, I/O mode, success/failure criteria) at the top
    - List of runs with status, connector, LLM provider, duration, and results
  - Web: Added "View" button and clickable titles in eval list for navigation to detail page
  - Runs track: status (pending/running/completed/failed), messages, output, result (success/score/reason), error, metadata (latency, tokens)
  - Runs stored in `~/.evalstudio/runs.json`
- Added connector test functionality to verify connectivity by sending a "hello" message
  - Core: `testConnector` function returns success/error status, latency, and response
  - API: `POST /connectors/:id/test` endpoint for testing connectors
  - Web: "Test" button on connector cards with inline result display (success/error, latency, response)
  - Supports HTTP (generic) and LangGraph connector types with appropriate auth handling
- Added typed connector configurations for better type safety
  - `LangGraphConnectorConfig`: assistantId (required), graphId, streamMode, metadata
  - `HttpConnectorConfig`: method, headers, timeout, path
  - Web: Dedicated "Assistant ID" field for LangGraph connectors

### Changed

- Moved connector delete button from list view to edit form for better UX

### Fixed

- Fixed connector authValue not being cleared when authType is changed to "none"
- Added Connectors feature for bridging EvalStudio to external API endpoints
  - Core: `createConnector`, `getConnector`, `getConnectorByName`, `listConnectors`, `updateConnector`, `deleteConnector`, `deleteConnectorsByProject`, `getConnectorTypes`
  - CLI: `evalstudio connector create|list|show|update|delete|types` commands with `--json` support
  - API: REST endpoints `GET/POST /connectors`, `GET/PUT/DELETE /connectors/:id`, `GET /connectors/types` with project filtering
  - Web: Settings page with Connectors list and create/edit forms
  - Supports two connector types: HTTP (generic REST API) and LangGraph (LangGraph Dev API)
  - Each connector has: name, type, baseUrl, authType, authValue, config
  - Connectors stored in `~/.evalstudio/connectors.json`
- Added LLM Providers feature for configuring AI provider credentials (OpenAI, Anthropic)
  - Core: `createLLMProvider`, `getLLMProvider`, `getLLMProviderByName`, `listLLMProviders`, `updateLLMProvider`, `deleteLLMProvider`, `deleteLLMProvidersByProject`, `getDefaultModels`
  - CLI: `evalstudio llm-provider create|list|show|update|delete|models` commands with `--json` support
  - API: REST endpoints `GET/POST /llm-providers`, `GET/PUT/DELETE /llm-providers/:id`, `GET /llm-providers/models` with project filtering
  - Web: Settings page with LLM Providers list and create/edit forms
  - Each provider has: name, provider (openai/anthropic), apiKey, config
  - Model selection deferred to eval execution time for flexibility
  - LLM providers stored in `~/.evalstudio/llm-providers.json`
- Added evals feature for combining personas with scenarios for agent evaluation
  - Core: `createEval`, `getEval`, `getEvalByPersonaAndScenario`, `getEvalWithRelations`, `listEvals`, `updateEval`, `deleteEval`, `deleteEvalsByProject`
  - CLI: `evalstudio eval create|list|show|update|delete` commands with `--json` support
  - API: REST endpoints `GET/POST /evals`, `GET/PUT/DELETE /evals/:id` with project filtering and `?expand=true` for relations
  - Web: Evals page with list view and create/edit forms
  - Evals uniquely identified by persona+scenario combination per project (no name field)
  - Supports both "messages" (conversational) and "structured" (JSON) I/O modes
  - Each eval has: description, ioMode, input, successCriteria, failureCriteria, maxMessages, personaId, scenarioId
  - Evals stored in `~/.evalstudio/evals.json`
- Added scenarios feature for defining test context and customer situations
  - Core: `createScenario`, `getScenario`, `getScenarioByName`, `listScenarios`, `updateScenario`, `deleteScenario`, `deleteScenariosByProject`
  - CLI: `evalstudio scenario create|list|show|update|delete` commands with `--json` support
  - API: REST endpoints `GET/POST /scenarios`, `GET/PUT/DELETE /scenarios/:id` with project filtering
  - Each scenario has: name, instructions (consolidated context for testing)
  - Scenarios stored in `~/.evalstudio/scenarios.json`
- Added centralized storage configuration (`getStorageDir`, `setStorageDir`, `resetStorageDir`) for test isolation
- Added personas feature for simulating different user interactions during testing
  - Core: `createPersona`, `getPersona`, `getPersonaByName`, `listPersonas`, `updatePersona`, `deletePersona`, `deletePersonasByProject`
  - CLI: `evalstudio persona create|list|show|update|delete` commands with `--json` support
  - API: REST endpoints `GET/POST /personas`, `GET/PUT/DELETE /personas/:id` with project filtering
  - Personas stored in `~/.evalstudio/personas.json`
  - Each persona has: name, description, systemPrompt
- Added client-side routing to web package with react-router-dom
  - Project-scoped URLs: `/project/:id`, `/project/:id/personas`, etc.
  - Sidebar navigation matching spec: Dashboard, Evals, Scenarios, Personas, Settings
  - Placeholder pages for Evals, Scenarios, Connectors, LLM Providers, Users
- Created `@evalstudio/web` package - web dashboard alternative to CLI
  - Built with Vite + React 18 + TanStack Query
  - Project management UI (list, create, edit, delete)
  - Status bar showing API connection
  - Proxies to API server at port 3000
- Added project management to support multiple evaluation contexts
  - Core: `createProject`, `getProject`, `getProjectByName`, `listProjects`, `updateProject`, `deleteProject`
  - CLI: `evalstudio project create|list|show|update|delete` commands with `--json` support
  - API: REST endpoints `GET/POST /projects`, `GET/PUT/DELETE /projects/:id`
  - Projects stored in `~/.evalstudio/projects.json`
- Set up monorepo with pnpm workspaces and Turborepo
- Created `evalstudio` core package with `getStatus()` function for checking system status
- Created `@evalstudio/cli` package with `evalstudio status` command (supports `--json` flag)
- Created `@evalstudio/api` package with Fastify server and `GET /status` endpoint
- Added unit tests for all packages using Vitest

### Changed

- **BREAKING**: Renamed "Test Cases" to "Evals" across all packages for better alignment with evalstudio naming
  - Core: `TestCase` → `Eval`, `createTestCase` → `createEval`, etc.
  - CLI: `evalstudio test-case` → `evalstudio eval`
  - API: `/test-cases` → `/evals`
  - Storage: `~/.evalstudio/test-cases.json` → `~/.evalstudio/evals.json`
  - Updated specs (SPEC.md, ARCHITECTURE.md, USER-STORIES.md) terminology

### Fixed

- Fixed test isolation - tests now use temporary directories instead of wiping real `~/.evalstudio/` data
