import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "@evalstudio/core";
import { createServer } from "../index.js";

let workspaceDir: string;
let projectId: string;
let prefix: string;

describe("connectors routes", () => {
  beforeAll(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "evalstudio-test-"));
    const result = initWorkspace(workspaceDir, "test-workspace", "test-project");
    projectId = result.project.id;
    prefix = `/api/projects/${projectId}`;
  });

  afterAll(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true });
    }
  });

  beforeEach(() => {
    const storagePath = join(workspaceDir, "projects", projectId, "data", "connectors.json");
    if (existsSync(storagePath)) {
      rmSync(storagePath);
    }
  });

  afterEach(() => {
    const storagePath = join(workspaceDir, "projects", projectId, "data", "connectors.json");
    if (existsSync(storagePath)) {
      rmSync(storagePath);
    }
  });

  describe("GET /connectors", () => {
    it("returns empty array when no connectors", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "GET",
        url: `${prefix}/connectors`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);

      await server.close();
    });

    it("returns all connectors", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "connector-1",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api1.example.com",
        },
      });

      await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "connector-2",
          type: "langgraph",
          baseUrl: "http://localhost:8123",
        },
      });

      const response = await server.inject({
        method: "GET",
        url: `${prefix}/connectors`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);

      await server.close();
    });
  });

  describe("GET /connectors/types", () => {
    it("returns available connector types", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "GET",
        url: `${prefix}/connectors/types`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      const langgraph = body.find((t: { type: string }) => t.type === "langgraph");
      expect(langgraph).toBeDefined();
      expect(langgraph.label).toBe("LangGraph");
      expect(langgraph.builtin).toBe(true);
      expect(langgraph.configSchema).toBeDefined();

      await server.close();
    });
  });

  describe("POST /connectors", () => {
    it("creates a connector with required fields", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "test-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("test-connector");
      expect(body.type).toBe("langgraph");
      expect(body.baseUrl).toBe("https://api.example.com");
      expect(body.id).toBeDefined();

      await server.close();
    });

    it("creates a connector with all fields", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "langgraph-connector",
          type: "langgraph",
          baseUrl: "http://localhost:8123",
          headers: { "X-API-Key": "lg-dev-key" },
          config: { assistantId: "my-assistant" },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe("langgraph");
      expect(body.headers).toEqual({ "X-API-Key": "lg-dev-key" });
      expect(body.config).toEqual({ assistantId: "my-assistant" });

      await server.close();
    });

    it("creates a connector with custom headers", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "headers-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
          headers: {
            "X-Custom": "custom-value",
            "X-Tenant-Id": "tenant-123",
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.headers).toEqual({
        "X-Custom": "custom-value",
        "X-Tenant-Id": "tenant-123",
      });

      await server.close();
    });

    it("returns 400 for missing name", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Name is required" });

      await server.close();
    });

    it("returns 400 for missing type", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "test-connector",
          baseUrl: "https://api.example.com",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Type is required" });

      await server.close();
    });

    it("returns 400 for missing baseUrl", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "test-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Base URL is required" });

      await server.close();
    });

    it("returns 409 for duplicate name", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "duplicate-name",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api1.example.com",
        },
      });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "duplicate-name",
          type: "langgraph",
          baseUrl: "http://localhost:8123",
        },
      });

      expect(response.statusCode).toBe(409);

      await server.close();
    });
  });

  describe("GET /connectors/:id", () => {
    it("returns connector by id", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const createResponse = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "test-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
        },
      });
      const created = JSON.parse(createResponse.body);

      const response = await server.inject({
        method: "GET",
        url: `${prefix}/connectors/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(created);

      await server.close();
    });

    it("returns 404 for non-existent id", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "GET",
        url: `${prefix}/connectors/non-existent`,
      });

      expect(response.statusCode).toBe(404);

      await server.close();
    });
  });

  describe("PUT /connectors/:id", () => {
    it("updates connector", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const createResponse = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "old-name",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://old.api.com",
        },
      });
      const created = JSON.parse(createResponse.body);

      const response = await server.inject({
        method: "PUT",
        url: `${prefix}/connectors/${created.id}`,
        payload: { name: "new-name", baseUrl: "https://new.api.com" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("new-name");
      expect(body.baseUrl).toBe("https://new.api.com");

      await server.close();
    });

    it("returns 404 for non-existent id", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "PUT",
        url: `${prefix}/connectors/non-existent`,
        payload: { name: "new-name" },
      });

      expect(response.statusCode).toBe(404);

      await server.close();
    });

    it("returns 409 for duplicate name on update", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "existing-name",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api1.example.com",
        },
      });

      const createResponse = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "to-be-updated",
          type: "langgraph",
          baseUrl: "http://localhost:8123",
        },
      });
      const created = JSON.parse(createResponse.body);

      const response = await server.inject({
        method: "PUT",
        url: `${prefix}/connectors/${created.id}`,
        payload: { name: "existing-name" },
      });

      expect(response.statusCode).toBe(409);

      await server.close();
    });
  });

  describe("DELETE /connectors/:id", () => {
    it("deletes connector", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const createResponse = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "test-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
        },
      });
      const created = JSON.parse(createResponse.body);

      const response = await server.inject({
        method: "DELETE",
        url: `${prefix}/connectors/${created.id}`,
      });

      expect(response.statusCode).toBe(204);

      const getResponse = await server.inject({
        method: "GET",
        url: `${prefix}/connectors/${created.id}`,
      });

      expect(getResponse.statusCode).toBe(404);

      await server.close();
    });

    it("returns 404 for non-existent id", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "DELETE",
        url: `${prefix}/connectors/non-existent`,
      });

      expect(response.statusCode).toBe(404);

      await server.close();
    });
  });

  describe("POST /connectors/:id/test", () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      mockFetch.mockReset();
    });

    it("tests connector successfully", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const createResponse = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "test-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
        },
      });
      const created = JSON.parse(createResponse.body);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ version: "0.1.0" }),
      });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors/${created.id}/test`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.response).toContain("0.1.0");
      expect(body.latencyMs).toBeGreaterThanOrEqual(0);

      await server.close();
    });

    it("returns error for non-existent connector", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors/non-existent/test`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain("not found");

      await server.close();
    });

    it("returns error on connection failure", async () => {
      const server = await createServer({ workspaceDir, runProcessor: false });

      const createResponse = await server.inject({
        method: "POST",
        url: `${prefix}/connectors`,
        payload: {
          name: "fail-connector",
          type: "langgraph",
          config: { assistantId: "test-assistant" },
          baseUrl: "https://api.example.com",
        },
      });
      const created = JSON.parse(createResponse.body);

      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const response = await server.inject({
        method: "POST",
        url: `${prefix}/connectors/${created.id}/test`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Connection refused");

      await server.close();
    });
  });
});
