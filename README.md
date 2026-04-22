# EvalStudio

A flexible evaluation platform for testing chatbots, AI agents, and REST APIs. Run multi-turn conversation tests, assess responses with LLM-as-judge, and integrate into your CI/CD pipeline.

## Key Features

- **Multi-turn conversation testing** - Define personas, scenarios, and seed messages to simulate realistic interactions
- **LLM-as-judge evaluation** - Evaluate agent responses against success and failure criteria using LLM
- **Multiple interfaces** - CLI for developers and CI/CD, Web UI for teams
- **Connectors** - Test LangGraph agents via configurable endpoints
- **Concurrent execution** - Run evaluations in parallel with configurable concurrency
- **Git-friendly** - Tests stored as JSON files, works seamlessly with version control

## Quick Start

```bash
# Initialize a project
mkdir my-evals && cd my-evals
npx @evalstudio/cli init

# Start the Web UI
npx @evalstudio/cli serve --open
```

This creates an `evalstudio.config.json` workspace config and a `projects/` directory with your first project, then opens the Web UI at `http://localhost:3000` where you can manage connectors, personas, scenarios, evals, and runs.

### CLI Workflow

Everything available in the Web UI can also be done from the command line. Install globally for shorter commands:

```bash
npm install -g @evalstudio/cli

# Configure an LLM provider for evaluation
evalstudio llm-provider set --provider openai --api-key sk-...

# Define the agent endpoint to test
evalstudio connector create "my-agent" \
  --type langgraph \
  --base-url "http://localhost:2024" \
  --config '{"assistantId": "agent"}'

# Create a persona and scenario
evalstudio persona create "frustrated-customer" \
  -d "A customer who is unhappy with their recent purchase"

evalstudio scenario create "refund-request" \
  -i "Ask for a refund on a recent order" \
  --success-criteria "Agent offers a refund or escalation path" \
  --failure-criteria "Agent ignores the refund request" \
  --personas "frustrated-customer"

# Create an eval and run it
evalstudio eval create -n "customer-service-eval" \
  -c "my-agent" --scenario "refund-request"

evalstudio run create -e "customer-service-eval"
evalstudio run process
```

All commands support `--json` for machine-readable output.

## Packages

| Package | Description |
|---------|-------------|
| `@evalstudio/core` | Core evaluation engine (zero dependencies) |
| `@evalstudio/cli` | CLI — bundles API and Web UI via `evalstudio serve` |
| `@evalstudio/api` | Fastify REST API server (embedded in CLI) |
| `@evalstudio/postgres` | PostgreSQL storage backend (optional) |
| `@evalstudio/web` | React Web UI (embedded in CLI) |
| `@evalstudio/docs` | Documentation site (Docusaurus) |

Published to npm: `@evalstudio/core`, `@evalstudio/cli`, `@evalstudio/api`, and `@evalstudio/postgres`. The Web UI is bundled into the CLI package.

## Documentation

- [SPEC.md](specs/SPEC.md) - Product requirements and feature specifications
- [ARCHITECTURE.md](specs/ARCHITECTURE.md) - System design and technology stack
- [USER-STORIES.md](specs/USER-STORIES.md) - Glossary and user stories

## Development

### Prerequisites

- Node.js 20+
- pnpm 9.15+

### Setup

```bash
git clone https://github.com/slv/evalstudio.git
cd evalstudio
pnpm install
pnpm build
```

### Commands

```bash
# Build all packages
pnpm build

# Run tests across all packages
pnpm test

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Development mode (watch)
pnpm dev

# Work on a specific package
pnpm --filter @evalstudio/core test
pnpm --filter @evalstudio/web dev
```

### Running Locally

```bash
# After building, start API + Web UI
node packages/cli/dist/index.js serve --open

# Or dev mode with hot reload
pnpm --filter @evalstudio/api start   # API on port 3000
pnpm --filter @evalstudio/web dev     # Web on port 5173 (proxies to 3000)
```

## Claude Code Commands

When using Claude Code, these slash commands are available:

| Command | Description |
|---------|-------------|
| `/feature` | Feature workflow (creates branch, tracks progress) |
| `/feature validate` | Run validation (typecheck, lint, test, build) |
| `/feature changelog` | Generate changelog entry |
| `/feature docs` | Update documentation |
| `/feature complete` | Validate + changelog + docs + commit |
| `/validate` | Run all validation steps (standalone) |
| `/changelog` | Generate changelog from git history (standalone) |
| `/docs` | Update documentation (standalone) |
| `/version` | Bump version across all packages |
| `/fast-forward-main` | Fast-forward main to current branch |

## Tech Stack

- **Core**: Node.js 20+, TypeScript, zero production dependencies
- **CLI**: Commander.js
- **API**: Fastify
- **Web**: React 18, Vite, TanStack Query, Recharts, React Router

## License

MIT
