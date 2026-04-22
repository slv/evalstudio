import { createPersonaModule, type PersonaModule, type Persona } from "./persona.js";
import { createScenarioModule, type ScenarioModule, type Scenario } from "./scenario.js";
import { createConnectorModule, type ConnectorModule, type Connector } from "./connector.js";
import { createExecutionModule, type ExecutionModule, type Execution } from "./execution.js";
import { createEvalModule, type EvalModule, type Eval } from "./eval.js";
import { createRunModule, type RunModule, type Run } from "./run.js";
import type { StorageProvider } from "./storage-provider.js";

/**
 * All entity modules for a project, fully wired with dependencies.
 */
export interface ProjectModules {
  personas: PersonaModule;
  scenarios: ScenarioModule;
  connectors: ConnectorModule;
  executions: ExecutionModule;
  evals: EvalModule;
  runs: RunModule;
}

/**
 * Creates all entity modules for a project, wired together with proper dependencies.
 *
 * Repositories are created via the StorageProvider — entity modules never know
 * whether they're backed by JSON files, PostgreSQL, or anything else.
 */
export function createProjectModules(storage: StorageProvider, projectId: string): ProjectModules {
  const personaRepo = storage.createRepository<Persona>("personas", projectId);
  const scenarioRepo = storage.createRepository<Scenario>("scenarios", projectId);
  const connectorRepo = storage.createRepository<Connector>("connectors", projectId);
  const executionRepo = storage.createRepository<Execution>("executions", projectId);
  const evalRepo = storage.createRepository<Eval>("evals", projectId);
  const runRepo = storage.createRepository<Run>("runs", projectId);

  const personaMod = createPersonaModule(personaRepo);
  const scenarioMod = createScenarioModule(scenarioRepo);
  const connectorMod = createConnectorModule(connectorRepo);
  const executionMod = createExecutionModule(executionRepo);

  const evalMod = createEvalModule(evalRepo, {
    scenarios: scenarioMod,
    connectors: connectorMod,
  });

  // Run gets all modules for FK validation
  const runMod = createRunModule(runRepo, {
    evals: evalMod,
    scenarios: scenarioMod,
    personas: personaMod,
    connectors: connectorMod,
    executions: executionMod,
  });

  return {
    personas: personaMod,
    scenarios: scenarioMod,
    connectors: connectorMod,
    executions: executionMod,
    evals: evalMod,
    runs: runMod,
  };
}
