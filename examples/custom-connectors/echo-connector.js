/**
 * Custom connector example: Echo Bot
 *
 * Demonstrates the custom connector plugin format using defineConnector().
 *
 * Setup:
 *   npm install
 *   node mock-server.js          ← start the mock API
 *   npx @evalstudio/cli serve     ← "Echo Bot" appears in the connector type dropdown
 *   Create connector: type=echo-bot, baseUrl=http://localhost:4000
 */

import { defineConnector } from "@evalstudio/core";

const echoBot = defineConnector({
  type: "echo-bot",
  label: "Echo Bot",
  description: "Simple echo connector for local testing — replies with 'Echo: <message>'",
  configSchema: {
    type: "object",
    properties: {
      prefix: {
        type: "string",
        description: "Optional prefix added before 'Echo:' in each reply",
      },
    },
  },
  strategy: {
    buildTestRequest(connector) {
      return {
        url: `${connector.baseUrl}/health`,
        method: "GET",
        headers: { "Content-Type": "application/json", ...connector.headers },
      };
    },

    buildInvokeRequest(connector, input) {
      const prefix = connector.config?.prefix;
      return {
        url: `${connector.baseUrl}/chat`,
        method: "POST",
        headers: { "Content-Type": "application/json", ...connector.headers },
        body: JSON.stringify({ messages: input.messages, prefix }),
      };
    },

    parseTestResponse(responseText) {
      try {
        const data = JSON.parse(responseText);
        return data.status === "ok" ? "Connection successful" : responseText;
      } catch {
        return responseText;
      }
    },

    parseInvokeResponse(responseText, _seenMessageIds) {
      const data = JSON.parse(responseText);
      return {
        messages: [{ role: "assistant", content: data.reply }],
        metadata: {},
      };
    },
  },
});

export default {
  connectors: [...echoBot.connectors],
};
