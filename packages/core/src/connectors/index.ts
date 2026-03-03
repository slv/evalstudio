/**
 * Connector implementations
 *
 * This directory contains the strategy implementations for each connector type.
 * Each connector type provides a ConnectorDefinition that includes:
 * - Type metadata (type, label, description, configSchema)
 * - A ConnectorStrategy for building requests and parsing responses
 *
 * Built-in connector definitions are collected in the builtinConnectors array
 * and registered into the ConnectorRegistry at startup.
 */

export type { ConnectorStrategy, ConnectorRequestConfig, ConnectorResponseMetadata } from "./base.js";
export { buildRequestHeaders } from "./base.js";
export { langGraphStrategy, langGraphDefinition } from "./langgraph.js";

import type { ConnectorDefinition } from "../connector-registry.js";
import { langGraphDefinition } from "./langgraph.js";

export const builtinConnectors: ConnectorDefinition[] = [
  langGraphDefinition,
];
