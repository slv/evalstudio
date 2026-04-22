# @evalstudio/cli

Command-line interface for [EvalStudio](https://github.com/slv/evalstudio) — a flexible evaluation platform for testing chatbots, AI agents, and REST APIs.

## Quick Start

### Install

```bash
npm install -g @evalstudio/cli

# Or run directly with npx
npx @evalstudio/cli --help
```

### Initialize a project

```bash
mkdir my-evals && cd my-evals
evalstudio init

# Or with npx
mkdir my-evals && cd my-evals
npx @evalstudio/cli init
```

This creates an `evalstudio.config.json` and a `data/` directory for storing test data.

### Start the Web UI

The fastest way to get started is through the Web UI, which lets you manage everything visually — connectors, personas, scenarios, evals, and runs:

```bash
evalstudio serve --open

# Or with npx
npx @evalstudio/cli serve --open
```

This starts the API server and Web UI on `http://localhost:3000`. From there you can create all your resources and trigger eval runs through the browser.

### CLI workflow

Everything available in the Web UI can also be done from the command line, which is useful for scripting and CI/CD pipelines.

#### Configure an LLM provider

Set up an LLM provider for evaluation (LLM-as-judge) and persona generation:

```bash
evalstudio llm-provider create "openai" --provider openai --api-key sk-...
```

#### Create a connector

Define the agent endpoint to test against. For example, a LangGraph dev server:

```bash
evalstudio connector create "my-agent" \
  --type langgraph \
  --base-url "http://localhost:2024" \
  --config '{"assistantId": "agent"}'
```

#### Create a persona and scenario

```bash
# Create a test persona
evalstudio persona create "frustrated-customer" \
  -d "A customer who is unhappy with their recent purchase"

# Create a test scenario
evalstudio scenario create "refund-request" \
  -i "Ask for a refund on a recent order" \
  --success-criteria "Agent offers a refund or escalation path" \
  --failure-criteria "Agent ignores the refund request" \
  --personas "frustrated-customer"
```

#### Create and run an eval

```bash
# Create an eval combining scenarios with a connector
evalstudio eval create -n "customer-service-eval" \
  -c "my-agent" \
  --scenario "refund-request"

# Create runs for the eval
evalstudio run create -e "customer-service-eval"

# Process queued runs
evalstudio run process
```

## Commands

| Command | Description |
|---------|-------------|
| `evalstudio init [name]` | Initialize a new project in the current directory |
| `evalstudio status` | Show project status and configuration |
| `evalstudio connector <sub>` | Manage connectors (create, list, show, update, delete, types) |
| `evalstudio llm-provider <sub>` | Manage LLM providers (create, list, show, update, delete, models) |
| `evalstudio persona <sub>` | Manage test personas (create, list, show, update, delete) |
| `evalstudio scenario <sub>` | Manage test scenarios (create, list, show, update, delete) |
| `evalstudio eval <sub>` | Manage evals (create, list, show, update, delete) |
| `evalstudio run <sub>` | Manage runs (create, list, show, delete, process) |
| `evalstudio serve` | Start the API server and Web UI |

All commands support `--json` for machine-readable output, useful for scripting and CI/CD pipelines.

### `evalstudio serve` options

| Option | Description |
|--------|-------------|
| `-p, --port <number>` | Port to listen on (default: 3000, env: `EVALSTUDIO_PORT`) |
| `--no-web` | Disable Web UI, serve API only |
| `--no-processor` | Disable background run processor |
| `--open` | Open browser after starting |

### `evalstudio run process` options

| Option | Description |
|--------|-------------|
| `-w, --watch` | Continuously watch and process queued runs |
| `-c, --concurrency <number>` | Max concurrent runs (default: 3) |
| `--poll <ms>` | Poll interval in milliseconds (default: 2000) |

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9.15+

### Clone and install

```bash
git clone https://github.com/slv/evalstudio.git
cd evalstudio
pnpm install
```

### Build

```bash
# Build all packages (required — CLI depends on core and api)
pnpm build

# Or build just the CLI and its dependencies
pnpm --filter @evalstudio/cli build
```

### Run locally

```bash
# Run the CLI directly from the build output
node packages/cli/dist/index.js status

# Or use pnpm to scope commands
pnpm --filter @evalstudio/cli build && node packages/cli/dist/index.js init
```

### Development workflow

```bash
# Watch mode — recompiles on changes
pnpm --filter @evalstudio/cli dev

# Run tests
pnpm --filter @evalstudio/cli test

# Watch mode for tests
pnpm --filter @evalstudio/cli test:watch

# Type checking
pnpm --filter @evalstudio/cli typecheck

# Linting
pnpm --filter @evalstudio/cli lint
```

### Project structure

```
packages/cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── init.ts        # Project initialization
│   │   ├── status.ts      # Status display
│   │   ├── connector.ts   # Connector CRUD
│   │   ├── eval.ts        # Eval CRUD
│   │   ├── llm-provider.ts # LLM provider CRUD
│   │   ├── persona.ts     # Persona CRUD
│   │   ├── run.ts         # Run management & processing
│   │   ├── scenario.ts    # Scenario CRUD
│   │   └── serve.ts       # API + Web server
│   └── __tests__/         # Test files
├── dist/                  # Compiled output
└── web-dist/              # Bundled Web UI (copied during build)
```

### Architecture

The CLI is a thin wrapper around `@evalstudio/core`. All business logic (storage, evaluation, connectors) lives in core — the CLI provides command parsing via [Commander.js](https://github.com/tj/commander.js) and formatted terminal output.

The `serve` command starts a [Fastify](https://fastify.dev/) server from `@evalstudio/api` and serves the pre-built Web UI from the `web-dist/` directory.

## License

MIT