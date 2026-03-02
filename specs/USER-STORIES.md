# EvalStudio - User Stories

## Glossary

- **Workspace** - A directory containing `evalstudio.config.json` with a project registry and shared defaults. Contains multiple projects under `projects/`.
- **Project** - A UUID-identified directory under `projects/` with its own `data/` folder and configuration in the workspace config's `projects[]` array. Entities are isolated per project.
- **Connector / Agent** - A project-scoped bridge that connects EvalStudio to a tested agent's API (currently LangGraph). Managed via the Agents page in the web UI.
- **Eval** - A test collection combining one or more scenarios with a connector. Each scenario can have its own personas and criteria.
- **Execution** - Groups all runs created together from a single eval execution (auto-increment ID)
- **Run** - A single test of one scenario/persona combination. Contains the conversation messages, connector response, and evaluation result.
- **Evaluator** - An LLM judge (criteria) or custom evaluator (assertion/metric) that assesses run results

---

## User Stories

### Test Personas

[x] As a user, I want to create multiple personas that interact with the agent I'm testing so that I can run various scenarios against them
[x] As a user, I want to describe each persona in natural language so that it's easy to understand and maintain
[x] As a user, I want to generate AI portrait images for personas so that they have visual identities in the UI
[x] As a user, I want to manage style reference images inline when generating a persona portrait so that I can upload, view, and delete style guides without leaving the persona page
[x] As a user, I want to set HTTP headers for each persona that merge with connector headers when making requests so that I can add extra info like tokens, user IDs, or language/country settings per persona

### Test Scenarios

[x] As a user, I want to create scenarios described in natural language so that I can define the issue or request the customer has, why they're reaching out, and background information needed to simulate the conversation

### Combining Personas & Scenarios

[x] As a user, I want to combine a persona with a scenario so that I can test how the agent handles specific situations with different customer types
[x] As a user, I want to run the same scenario with multiple personas so that I can verify consistent handling
[x] As a user, I want personas to generate realistic messages based on their description so that tests feel natural
[x] As a user, I want to reuse personas across multiple evals so that I maintain consistency
[x] As a user, I want to associate multiple scenarios to an eval so that I can create scenario/persona combinations and maintain evals as collections of tests to run
[x] As a user, I want to search and filter scenarios in the eval page so that I can quickly find and select scenarios when there are many

### Conversation Seeding

[x] As a user, I want to provide an initial set of messages to a scenario and let generation/evaluation continue from that point so that I can cover complex scenarios by copying real conversations and assess various endings
[x] As a user, I want to create/edit the scenario seeding messages with a dedicated UI which allow to add/remove messages without having to write a JSON structure
[x] As a user, I want the system to detect who sent the last seed message: if it's from the agent, generate a persona message first; if it's from the persona, send directly to the agent for a reply

### Connectors and Providers

[x] As a user, I want to define an LLM Provider between multiple providers (initially OpenAI and Anthropic) to be used to generate "tester" messages and to assess success/failure criteria
[x] As a user, I want to configure project-level LLM settings for evaluation and persona generation so that I don't need to configure LLM providers for each eval individually
[x] As a user, I want to set up a single LLM provider via the settings page and have it stored in evalstudio.config.json so that configuration is simple and doesn't require managing separate provider entities
[x] As a user, I want provider credentials and model selection in a single unified `llmSettings` object so that LLM configuration is flat and easy to understand
[x] As a user, I want to see models grouped by tier (Standard/Premium) when selecting models so that I can make informed choices about cost and capability
[x] As a user, I want to define connectors that bridge EvalStudio to my LangGraph Dev API endpoint so that I can test my langgraph-backed chatbot
[x] As a user, I want to quickly test the connector just created by clicking a button somewhere on the connector itself, it should send an "hello" msg to the connected chatbot and check the response
[x] As a user, I want connectors to be global and reusable so that I can reference them across multiple runs and evals
[x] As a user, I want to configure connector-specific settings (endpoint URL, authentication, headers) so that I can connect to secured APIs
[x] As a user, I want to set arbitrary custom headers on connectors so that I can flexibly provide API keys, authorization tokens, and other headers without being limited to predefined auth types
[x] As a user, I want to set LangGraph configurable values on connectors so that I can pass runtime configuration to my LangGraph agents
[x] As a user, I want API keys to be redacted in API responses and CLI output so that credentials are not accidentally exposed

### Agents

[x] As a user, I want a dedicated Agents page where I can configure agents (connectors) and interact with them via live chat so that I have a single place to manage and test my agents
[x] As a user, I want to chat with my agents in real-time from the Agents page so that I can quickly test and debug agent behavior without setting up formal evaluations
[x] As a user, I want to see chat history in the Agents page sidebar so that I can resume or review previous conversations
[x] As a user, I want to see an online/offline status indicator for each agent so that I know if the agent is reachable before starting a conversation
[x] As a user, I want to edit agent settings (name, URL, assistant ID, configurable, headers) inline on the Agents page so that I don't need to navigate to a separate settings page

### Running Evals

[x] As a user, I want to enter a dedicated Eval page where I can see all the Eval settings on top, and the list of various runs (and results) for that specific Eval
[x] As a user, I want to create an Eval "Run" with runtime config (connector, LLM provider, model), the run will be created in a "queued" status (later we'll implement the actual execution of queued runs), I want to create the Run from the Eval detail page
[x] As a developer, I want connectors to normalize token usage and metadata into a consistent format so that I can build evaluators and features that depend on structured data regardless of the underlying provider

### Batch Runs

[ ] As a user, I want to configure run-level settings (connector, LLM provider, concurrency) so that all evals inherit shared config
[ ] As a user, I want to compare results across runs so that I can track changes over time

### Performance Monitoring

[x] As a user, I want to see performance charts on Eval, Persona, and Scenario detail pages showing pass/fail rate and average latency over time so that I have a visual representation of performance trends
[x] As a user, I want performance charts grouped by execution so that I can compare results across batch executions
[x] As a user, I want to see aggregated performance charts on the Dashboard showing all evals and personas pass rates so that I can get a quick overview of overall performance
[x] As a user, I want to see average output tokens in performance charts so that I can track token usage trends alongside pass rate and latency
[x] As a user, I want to see individual run latencies as a scatter chart alongside the average latency line so that I can identify outliers and variance across runs
[x] As a user, I want to click on a latency scatter dot to open the run conversation so that I can quickly investigate slow runs
[x] As a user, I want detail page tabs to persist when navigating between entities of the same type so that I don't lose my place when switching between scenarios, evals, or personas
[x] As a user, I want to navigate directly to the last visited entity detail page and switch between entities via a dropdown so that I can skip the listing page and quickly resume where I left off
[x] As a user, I want to see an execution summary on the Dashboard for each eval showing pass rate, stats, and failure details so that I can get a quick overview without navigating into each eval
[x] As a user, I want the dashboard to show compact eval cards for the 4 most recently executed evals with key metrics and a link to navigate to the eval so that I can quickly assess recent results and drill in
[x] As a user, I want to see an execution summary at the top of the Eval Stats tab so that I can immediately understand the latest execution results

### Results Review & Iteration

[x] As a user, I want to review the full conversation from an eval run so that I can understand what happened
[x] As a user, I want tool calls and results displayed clearly in the conversation view so that I can see what tools the agent used and what they returned
[ ] As a user, I want to edit any message in a completed run so that I can test alternative paths
[ ] As a user, I want to re-run from an edited message so that I can see how the agent responds to the change
[ ] As a user, I want edits to be recorded as few-shot examples so that future runs of the same scenario can learn from corrections
[ ] As a user, I want recorded examples to be injected into the LLM system prompt so that the persona generates better messages over time

### Test Execution Loop

[x] As a user, I want EvalStudio to simulate a conversation by sending messages to the tested agent and generating replies based on persona/scenario until completion so that the full interaction is tested automatically
[x] As a user, I want to define success criteria in natural language so that an LLM judge can determine when the desired outcome is achieved
[x] As a user, I want to define failure criteria in natural language so that an LLM judge can detect undesired behavior
[x] As a user, I want to choose when failure criteria is checked — at every turn (like success criteria) or only when max messages is reached — so that I can control whether the agent gets a chance to recover from mistakes
[x] As a user, I want to set a maximum message limit per scenario so that tests don't run indefinitely if no criteria is met

### Custom Evaluators

[x] As a user, I want to attach metric and assertion evaluators to scenarios so that I can measure tool call counts, token usage, and other custom metrics alongside LLM-as-judge evaluation
[x] As a user, I want built-in evaluators (tool-call-count, token-usage) to run automatically on every scenario so that I always have baseline metrics without manual configuration
[x] As a user, I want to see evaluator results in the run detail modal alongside criteria evaluation so that all evaluation data is in one place
[x] As a developer, I want to create custom evaluators by implementing EvaluatorDefinition and registering them in the EvaluatorRegistry so that I can extend evaluation beyond built-in metrics
[x] As a developer, I want to declare custom evaluators in `evalstudio.config.json` so that they are automatically loaded at startup without programmatic registration

### Projects

[x] As a user, I want to initialize a local project directory so that I can keep evaluation data alongside my codebase
[x] As a user, I want one folder to equal one project so that project isolation is simple and follows standard dev tool conventions
[x] As a user, I want to point to a project directory via `EVALSTUDIO_PROJECT_DIR` so that I can run commands from any working directory
[x] As a user, I want a clear error message when no project is found so that I know how to fix it (init, cd, or set env var)
[x] As a user, I want to set the max concurrent run executions from the web UI settings page and CLI so that I can control resource usage without editing config files
[x] As a user, I want to manage multiple projects within a single workspace so that I can organize evals for different products or environments
[x] As a user, I want to create, list, show, update, and delete projects via CLI and API so that I can manage projects programmatically
[x] As a user, I want to switch between projects in the web UI via a dropdown in the sidebar so that I can quickly navigate between projects
[x] As a user, I want workspace-level defaults that projects inherit so that I don't need to configure LLM settings for every project
[x] As a user, I want per-project configuration overrides so that individual projects can differ from workspace defaults

### Collaboration & Permissions

[ ] As an admin, I want to invite collaborators to a project so that my team can work together
[ ] As an admin, I want to assign roles (Viewer, Member, Admin) to collaborators so that I can control access levels
[ ] As an admin, I want to remove collaborators from a project so that I can revoke access when needed
[ ] As a viewer, I want to see evals, scenarios, and personas so that I can review the evaluation results
[ ] As a member, I want to create and edit evals, scenarios, and personas so that I can contribute to the evaluation process
[ ] As an admin, I want to manage settings (connectors, LLM providers, users) so that I can configure the project infrastructure
[ ] As an owner, I want to be the only user who cannot be removed from the project so that the project always has a responsible party
[ ] As an owner, I want to transfer ownership to another user so that I can hand over the project if needed
[ ] As an owner, I want to delete the project so that I can remove it when no longer needed

### Storage

[x] As a user, I want to configure PostgreSQL as a storage backend so that I can use a proper database for team environments and production
[x] As a user, I want to initialize the PostgreSQL schema with a CLI command so that database setup is explicit and controlled
[x] As a user, I want the storage backend to be selected automatically from workspace config so that switching between filesystem and postgres is seamless
[x] As a user, I want connection string environment variable placeholders so that I can keep credentials out of config files
[x] As a user, I want database schema changes managed via versioned migrations so that upgrades are safe and tracked
[x] As a user, I want to check which database migrations have been applied so that I can troubleshoot schema issues
[x] As a user, I want filesystem storage to automatically prune old executions and their runs so that disk usage doesn't grow unboundedly

### Data Management

[x] As a user, I want to export selected scenarios in JSONL format so that I can back them up or share them with other projects
[x] As a user, I want to import scenarios from a JSONL file so that I can bulk-create scenarios from external sources
[x] As a user, I want to override the storage directory via an environment variable so that I can use different data locations for different environments

### Developer Experience

[x] As a developer, I want the core package to have minimal dependencies so that install times are fast and the package is lightweight
[x] As a user, I want to start the API server and web UI with a single `evalstudio serve` command so that I don't need to run separate processes
[x] As a user, I want documentation automatically deployed to GitHub Pages so that I can always access up-to-date docs online
[x] As a developer, I want entity storage abstracted behind a repository interface so that I can swap storage backends in the future
[x] As a developer, I want a StorageProvider interface with async Repository so that I can plug in a PostgreSQL backend without changing business logic
[x] As a developer, I want the Repository to support targeted operations (findById, save, deleteById) so that the Postgres backend can use efficient single-row SQL instead of loading entire collections
[x] As a user, I want documentation that accurately reflects the current codebase so that I can trust the docs when integrating with the API, CLI, or core library

### Integrations

[ ] As a user I want to run Evals when a webhook is triggered from another source, e.g. a new commit on master on Github, so that it's easier to integrate the tool into other tools
