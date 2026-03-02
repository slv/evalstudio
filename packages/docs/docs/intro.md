---
slug: /
sidebar_position: 1
---

# Introduction

EvalStudio is a flexible evaluation platform for testing chatbots, AI agents, and REST APIs. Run multi-turn conversation tests or structured JSON evaluations, assess responses with LLM-as-judge, and integrate into your CI/CD pipeline.

## Key Features

- **Multi-turn conversation testing** - Define personas, scenarios, and seed messages to simulate realistic interactions
- **Multiple interfaces** - CLI for developers/CI, Web UI for teams, REST API for automation
- **Connectors** - Test [LangGraph agents](/guides/langgraph-setup) via configurable endpoints
- **LLM-as-judge evaluation** - Evaluate agent responses against success and failure criteria using LLM
- **Concurrent execution** - Run evaluations in parallel with configurable concurrency
- **Git-friendly** - Tests stored as JSON files, works seamlessly with version control

## Packages

| Package | Description |
|---------|-------------|
| `@evalstudio/core` | Core evaluation engine (zero dependencies) |
| `@evalstudio/cli` | CLI — bundles API and Web UI via `evalstudio serve` |
| `@evalstudio/api` | Fastify REST API server (embedded in CLI) |
| `@evalstudio/web` | React Web UI (embedded in CLI) |
| `@evalstudio/postgres` | Optional PostgreSQL storage backend |
| `@evalstudio/docs` | Documentation site (you're here!) |

## Quick Links

**Getting Started**
- [Installation](./getting-started/installation)
- [Quick Start](./getting-started/quick-start)

**Reference**
- [Core Library](./core/status) - Status, Projects, Personas, Scenarios, Evals, LLM Providers, Connectors
- [CLI Reference](./cli/status) - Command-line interface
- [API Reference](./api/status) - REST API endpoints
- [Web Dashboard](./web/getting-started) - Browser-based UI
