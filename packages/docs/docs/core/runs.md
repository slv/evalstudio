---
sidebar_position: 6
---

# Runs

Manage evaluation runs that track the execution of evals with specific runtime configurations. Runs capture the conversation history, results, and metadata for each eval execution.

## Import

```typescript
import {
  createProjectModules,
  createStorageProvider,
  resolveWorkspace,
  RunProcessor,
  evaluateCriteria,
  generatePersonaMessage,
  type Run,
  type RunStatus,
  type RunResult,
  type CreateRunInput,
  type CreatePlaygroundRunInput,
  type CreateChatRunInput,
  type UpdateRunInput,
  type ListRunsOptions,
  type RunProcessorOptions,
  type CriteriaEvaluationResult,
  type GeneratePersonaMessageResult,
} from "@evalstudio/core";
```

## Setup

All entity operations are accessed through project modules:

```typescript
const workspaceDir = resolveWorkspace();
const storage = await createStorageProvider(workspaceDir);
const modules = createProjectModules(storage, projectId);
```

## Types

### Run

```typescript
interface Run {
  id: string;                    // Unique identifier (UUID)
  evalId?: string;               // Parent eval ID (optional for playground runs)
  personaId?: string;            // Persona ID used for this run
  scenarioId?: string;           // Scenario ID used for this run
  connectorId?: string;          // Connector ID (for playground runs without eval)
  executionId?: number;          // Auto-generated ID grouping runs in the same batch
  status: RunStatus;             // Run status
  startedAt?: string;            // ISO timestamp when run started
  completedAt?: string;          // ISO timestamp when run completed
  latencyMs?: number;            // Total execution time in milliseconds
  threadId?: string;             // Thread ID for LangGraph (regenerated on retry)
  messages: Message[];           // Conversation history (includes system prompt)
  output?: Record<string, unknown>; // Structured output
  result?: RunResult;            // Evaluation result
  error?: string;                // Error message if failed
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

Note: For eval-based runs, the connector is configured at the Eval level. For playground runs (without an eval), `connectorId` is stored directly on the run. LLM provider for evaluation is always configured at the project level via `evalstudio.config.json` `llmSettings`. The `personaId` and `scenarioId` are always stored directly on the run at creation time.

The `messages` array includes all messages stored during execution:
- System prompt (generated from persona/scenario)
- Seed messages from scenario
- Response messages from the agent

### RunStatus

```typescript
type RunStatus = "queued" | "pending" | "running" | "completed" | "error" | "chat";
```

- `queued` - Run created and waiting to be executed
- `pending` - Run is being prepared for execution
- `running` - Run is currently executing
- `completed` - Run finished (check `result.success` for pass/fail). Evaluation failures use this status with `result.success: false`
- `error` - Run encountered a system error (check error field). Only runs with this status can be retried
- `chat` - Live chat session in the Agents page. Chat runs are not processed by RunProcessor and are excluded from eval-related run lists

### RunResult

```typescript
interface RunResult {
  success: boolean;    // Whether the eval passed
  score?: number;      // Optional score (0-1)
  reason?: string;     // Explanation of result
}
```

### CreateRunInput

```typescript
interface CreateRunInput {
  evalId: string;                // Required: eval to run
}
```

Runs use the connector and LLM provider configured on the parent Eval. When runs are created, they are automatically assigned an `executionId` that groups all runs created in the same batch. This ID is auto-incremented.

### CreatePlaygroundRunInput

```typescript
interface CreatePlaygroundRunInput {
  scenarioId: string;            // Required: scenario to run
  connectorId: string;           // Required: connector for invoking the agent
  personaId?: string;            // Optional: persona to simulate
}
```

Used for creating runs directly from scenarios without requiring an eval. The connector is specified directly since there's no parent eval to inherit from. LLM provider for evaluation is resolved from the project's `evalstudio.config.json` `llmSettings`.

### CreateChatRunInput

```typescript
interface CreateChatRunInput {
  connectorId: string;           // Required: connector for the chat session
}
```

Used for creating live chat runs from the Agents page. Chat runs have `status: "chat"` and are not processed by RunProcessor.

### UpdateRunInput

```typescript
interface UpdateRunInput {
  status?: RunStatus;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  threadId?: string;
  messages?: Message[];
  output?: Record<string, unknown>;
  result?: RunResult;
  error?: string;
}
```

### ListRunsOptions

```typescript
interface ListRunsOptions {
  evalId?: string;       // Filter by eval ID
  scenarioId?: string;   // Filter by scenario ID
  status?: RunStatus;    // Filter by status
  limit?: number;        // Maximum number of runs to return
}
```

### RunProcessorOptions

```typescript
interface RunProcessorOptions {
  pollIntervalMs?: number;   // Polling interval in milliseconds (default: 5000)
  maxConcurrent?: number;    // Max concurrent runs (falls back to project config, then 3)
  onStatusChange?: (runId: string, status: RunStatus, run: Run) => void;
  onRunStart?: (run: Run) => void;
  onRunComplete?: (run: Run, result: ConnectorInvokeResult) => void;
  onRunError?: (run: Run, error: Error) => void;
}
```

## Methods

### modules.runs.createMany()

Creates one or more runs for an eval. If the eval's scenario has multiple personas associated with it (`personaIds`), one run is created for each persona.

```typescript
async function createMany(input: CreateRunInput): Promise<Run[]>;
```

**Throws**: Error if the eval, scenario, or any persona doesn't exist.

```typescript
const runs = await modules.runs.createMany({
  evalId: "eval-uuid",
});
// If scenario has 3 personas, returns 3 runs
// Each run has personaId and scenarioId stored directly
// All runs share the same executionId (auto-assigned)
// runs[0].status === "queued"
```

### modules.runs.create()

Creates a single run for an eval. This is a convenience wrapper around `createMany()` that returns only the first run.

```typescript
async function create(input: CreateRunInput): Promise<Run>;
```

**Throws**: Error if the eval doesn't exist.

```typescript
const run = await modules.runs.create({
  evalId: "eval-uuid",
});
// run.status === "queued"
// run.personaId and run.scenarioId are stored directly
// run.executionId is auto-assigned
```

### modules.runs.createPlayground()

Creates a run directly from a scenario without requiring an eval. Useful for testing scenarios in a playground environment before setting up formal evaluations.

```typescript
async function createPlayground(input: CreatePlaygroundRunInput): Promise<Run>;
```

**Throws**: Error if the scenario, connector, or persona doesn't exist.

```typescript
const run = await modules.runs.createPlayground({
  scenarioId: "scenario-uuid",
  connectorId: "connector-uuid",
  personaId: "persona-uuid",        // Optional
});
// run.status === "queued"
// run.evalId is undefined
// run.connectorId is stored directly
```

The run is processed by `RunProcessor` like any other run. The processor checks for `connectorId` on the run itself when `evalId` is not present. LLM provider for evaluation is resolved from the project's `evalstudio.config.json` `llmSettings`.

### modules.runs.createChatRun()

Creates a live chat run for a connector. Used by the Agents page for interactive chat sessions.

```typescript
async function createChatRun(input: CreateChatRunInput): Promise<Run>;
```

**Throws**: Error if the connector doesn't exist.

```typescript
const run = await modules.runs.createChatRun({
  connectorId: "connector-uuid",
});
// run.status === "chat"
// run.connectorId is stored directly
// run.evalId, run.scenarioId, run.personaId are undefined
```

Chat runs are not processed by `RunProcessor`. They are managed interactively through the Agents page live chat interface.

### modules.runs.get()

Gets a run by its ID.

```typescript
async function get(id: string): Promise<Run | undefined>;
```

```typescript
const run = await modules.runs.get("run-uuid");
```

### modules.runs.list()

Lists runs with flexible filtering options.

```typescript
async function list(options?: ListRunsOptions): Promise<Run[]>;
```

```typescript
// List all runs
const allRuns = await modules.runs.list();

// Filter by status
const queuedRuns = await modules.runs.list({ status: "queued", limit: 10 });

// Filter by eval
const evalRuns = await modules.runs.list({ evalId: "eval-uuid", status: "completed" });

// Filter by scenario
const scenarioRuns = await modules.runs.list({ scenarioId: "scenario-uuid" });
```

When using the options-based API, results are sorted by `createdAt` (oldest first), making it suitable for queue processing.

### modules.runs.listByEval()

Lists runs for a specific eval, sorted by creation date (newest first).

```typescript
async function listByEval(evalId: string): Promise<Run[]>;
```

```typescript
const evalRuns = await modules.runs.listByEval("eval-uuid");
// Returns runs sorted by createdAt descending
```

### modules.runs.listByScenario()

Lists runs for a specific scenario, sorted by creation date (newest first).

```typescript
async function listByScenario(scenarioId: string): Promise<Run[]>;
```

```typescript
const scenarioRuns = await modules.runs.listByScenario("scenario-uuid");
```

### modules.runs.listByPersona()

Lists runs for a specific persona, sorted by creation date (newest first).

```typescript
async function listByPersona(personaId: string): Promise<Run[]>;
```

```typescript
const personaRuns = await modules.runs.listByPersona("persona-uuid");
```

### modules.runs.listByConnector()

Lists runs for a specific connector, sorted by creation date (newest first).

```typescript
async function listByConnector(connectorId: string): Promise<Run[]>;
```

```typescript
const connectorRuns = await modules.runs.listByConnector("connector-uuid");
// Returns all runs (including chat runs) for this connector
```

### modules.runs.update()

Updates an existing run.

```typescript
async function update(id: string, input: UpdateRunInput): Promise<Run | undefined>;
```

```typescript
// Start a run
await modules.runs.update(run.id, {
  status: "running",
  startedAt: new Date().toISOString(),
});

// Complete a run with success
await modules.runs.update(run.id, {
  status: "completed",
  completedAt: new Date().toISOString(),
  latencyMs: 1500,
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
  ],
  result: {
    success: true,
    score: 0.95,
    reason: "Agent responded appropriately",
  },
});

// Mark a run as error (system failure - retryable)
await modules.runs.update(run.id, {
  status: "error",
  completedAt: new Date().toISOString(),
  error: "Connection timeout",
});
```

### modules.runs.delete()

Deletes a run by its ID.

```typescript
async function delete(id: string): Promise<boolean>;
```

Returns `true` if the run was deleted, `false` if not found.

```typescript
const deleted = await modules.runs.delete(run.id);
```

### modules.runs.retry()

Retries a failed run by resetting it to "queued" status with a fresh thread ID.

```typescript
async function retry(id: string): Promise<Run | undefined>;
```

**Throws**: Error if the run's status is not `"error"`. Only runs with system errors can be retried.

```typescript
const retriedRun = await modules.runs.retry(run.id);
// retriedRun.status === "queued"
// retriedRun.messages === []
// retriedRun.threadId is regenerated
```

## RunProcessor

The `RunProcessor` class provides background execution of queued evaluation runs. It polls for runs with status "queued" and executes them via the configured connector.

### Creating a Processor

```typescript
const processor = new RunProcessor({
  pollIntervalMs: 5000,    // Poll every 5 seconds (default)
  maxConcurrent: 3,        // Process up to 3 runs concurrently (default)
  onStatusChange: (runId, status, run) => {
    console.log(`Run ${runId} is now ${status}`);
  },
  onRunStart: (run) => {
    console.log(`Started processing run ${run.id}`);
  },
  onRunComplete: (run, result) => {
    console.log(`Run ${run.id} completed`);
  },
  onRunError: (run, error) => {
    console.error(`Run ${run.id} failed:`, error.message);
  },
});
```

### Starting and Stopping

```typescript
// Start the processor (begins polling for queued runs)
processor.start();

// Check if running
console.log(processor.isRunning()); // true

// Get active run count
console.log(processor.getActiveRunCount()); // 0-maxConcurrent

// Graceful shutdown (waits for active runs to complete)
await processor.stop();
```

### One-Shot Processing

For CLI tools or testing, you can process queued runs without starting the polling loop:

```typescript
const processor = new RunProcessor();

// Process one batch of queued runs and wait for completion
const started = await processor.processOnce();
console.log(`Started ${started} runs`);
```

### Crash Recovery

When `start()` is called, the processor automatically resets any runs stuck in "running" status back to "queued". This handles recovery from crashes or unexpected shutdowns.

### Usage with CLI and API

The same `RunProcessor` can be used from both CLI and API contexts:

```typescript
// CLI usage
const processor = new RunProcessor({
  onStatusChange: (runId, status) => {
    process.stdout.write(`\r${runId}: ${status}`);
  },
});
processor.start();

// API usage (e.g., in Fastify)
const processor = new RunProcessor({
  onStatusChange: (runId, status, run) => {
    websocket.broadcast({ type: 'run_status', runId, status, run });
  },
});
processor.start();
```

### Atomic Claiming

The processor uses atomic status transitions to prevent duplicate processing across multiple processor instances. When a run is claimed:

1. The run's status is checked to be "queued"
2. Status is atomically updated to "running"
3. If another processor claimed it first, the claim fails and the run is skipped

### Evaluation Loop

When an eval has an LLM provider configured, the RunProcessor uses a multi-turn evaluation loop:

1. **Send message to agent** - The user message (from scenario seed or generated) is sent to the connector
2. **Evaluate response** - The agent's response is evaluated against the scenario's `successCriteria` and `failureCriteria` using an LLM judge
3. **Check termination conditions**:
   - If `successCriteria` is met → Run completes as **passed**
   - If `failureCriteria` is met and `failureCriteriaMode` is `"every_turn"` → Run completes as **failed**
   - If `maxMessages` limit is reached → Run completes (pass/fail based on final evaluation)
   - Otherwise → Continue to step 4
4. **Generate next user message** - An LLM generates a contextual user message, optionally impersonating the configured persona
5. **Loop** - Return to step 1

**Failure Criteria Modes**: The `failureCriteriaMode` field on the scenario controls when failure criteria stops the loop:
- `"on_max_messages"` (default): Failure criteria is only checked when `maxMessages` is reached without success. This allows the agent to recover from mistakes during the conversation.
- `"every_turn"`: Failure criteria is checked at every turn, just like success criteria. The loop stops immediately when failure is detected.

If no LLM provider is configured, the processor falls back to single-turn execution (one request/response cycle).

## Standalone Functions

### evaluateCriteria()

Evaluates a conversation against success and failure criteria using an LLM judge.

```typescript
interface EvaluateCriteriaInput {
  messages: Message[];
  successCriteria?: string;
  failureCriteria?: string;
  llmProvider: LLMProvider;
  model?: string;
}

interface CriteriaEvaluationResult {
  successMet: boolean;
  failureMet: boolean;
  confidence: number;  // 0-1 score
  reasoning: string;
  rawResponse?: string;
}

function evaluateCriteria(input: EvaluateCriteriaInput): Promise<CriteriaEvaluationResult>;
```

```typescript
const result = await evaluateCriteria({
  messages: conversationHistory,
  successCriteria: "User successfully booked an appointment",
  failureCriteria: "Agent refused to help or provided incorrect information",
  llmProvider: provider,  // LLMProvider object from getLLMProviderFromProjectConfig()
});

console.log(result.successMet);   // true/false
console.log(result.failureMet);   // true/false
console.log(result.confidence);   // 0.95
console.log(result.reasoning);    // "The agent successfully helped..."
```

### generatePersonaMessage()

Generates a contextual user message for continuing a conversation, optionally impersonating a persona.

```typescript
interface GeneratePersonaMessageInput {
  messages: Message[];
  persona?: Persona;      // Optional - generates generic user message if not provided
  scenario: Scenario;
  llmProvider: LLMProvider;
  model?: string;
}

interface GeneratePersonaMessageResult {
  content: string;
  rawResponse?: string;
}

function generatePersonaMessage(input: GeneratePersonaMessageInput): Promise<GeneratePersonaMessageResult>;
```

```typescript
const result = await generatePersonaMessage({
  messages: conversationHistory,
  persona: userPersona,  // Optional
  scenario: testScenario,
  llmProvider: provider,  // LLMProvider object
});

console.log(result.content);  // "I'd like to reschedule my appointment to next Tuesday"
```

## Storage

Runs are stored in `data/runs.json` within the project directory.
