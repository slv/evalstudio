import type { FastifyInstance } from "fastify";
import {
  createProjectModules,
  getLLMProviderFromProjectConfig,
  generatePersonaImage,
} from "@evalstudio/core";

interface CreatePersonaBody {
  name: string;
  description?: string;
  systemPrompt?: string;
  headers?: Record<string, string>;
}

interface UpdatePersonaBody {
  name?: string;
  description?: string;
  systemPrompt?: string;
  imageUrl?: string;
  headers?: Record<string, string>;
}

interface PersonaParams {
  id: string;
}

export async function personasRoute(fastify: FastifyInstance) {
  fastify.get("/personas", async (request) => {
    const { personas } = createProjectModules(fastify.storage, request.projectCtx!.id);
    return await personas.list();
  });

  fastify.get<{ Params: PersonaParams }>(
    "/personas/:id",
    async (request, reply) => {
      const { personas } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const persona = await personas.get(request.params.id);

      if (!persona) {
        reply.code(404);
        return { error: "Persona not found" };
      }

      return persona;
    }
  );

  fastify.post<{ Body: CreatePersonaBody }>(
    "/personas",
    async (request, reply) => {
      const { name, description, systemPrompt, headers } = request.body;

      if (!name) {
        reply.code(400);
        return { error: "Name is required" };
      }

      try {
        const { personas } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const persona = await personas.create({
          name,
          description,
          systemPrompt,
          headers,
        });
        reply.code(201);
        return persona;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(409);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.put<{ Params: PersonaParams; Body: UpdatePersonaBody }>(
    "/personas/:id",
    async (request, reply) => {
      const { name, description, systemPrompt, imageUrl, headers } = request.body;

      try {
        const { personas } = createProjectModules(fastify.storage, request.projectCtx!.id);
        const persona = await personas.update(request.params.id, {
          name,
          description,
          systemPrompt,
          imageUrl,
          headers,
        });

        if (!persona) {
          reply.code(404);
          return { error: "Persona not found" };
        }

        return persona;
      } catch (error) {
        if (error instanceof Error) {
          reply.code(409);
          return { error: error.message };
        }
        throw error;
      }
    }
  );

  fastify.delete<{ Params: PersonaParams }>(
    "/personas/:id",
    async (request, reply) => {
      const { personas } = createProjectModules(fastify.storage, request.projectCtx!.id);
      const deleted = await personas.delete(request.params.id);

      if (!deleted) {
        reply.code(404);
        return { error: "Persona not found" };
      }

      reply.code(204);
      return;
    }
  );

  // ── Generate persona image with AI ─────────────────────────────────

  fastify.post<{ Params: PersonaParams }>(
    "/personas/:id/generate-image",
    async (request, reply) => {
      const ctx = request.projectCtx!;
      const { personas } = createProjectModules(fastify.storage, ctx.id);
      const persona = await personas.get(request.params.id);

      if (!persona) {
        reply.code(404);
        return { error: "Persona not found" };
      }

      if (!persona.systemPrompt) {
        reply.code(400);
        return { error: "Persona must have a system prompt to generate an image" };
      }

      // Get LLM provider — must be OpenAI for image generation
      let provider;
      try {
        provider = await getLLMProviderFromProjectConfig(
          fastify.storage,
          ctx.workspaceDir,
          ctx.id,
        );
      } catch {
        reply.code(400);
        return { error: "No LLM provider configured. Configure one in Settings > LLM Providers." };
      }

      if (provider.provider !== "openai") {
        reply.code(400);
        return { error: "Image generation requires an OpenAI provider. Switch to OpenAI in Settings > LLM Providers." };
      }

      // Load style reference buffers from image store by role
      const imageStore = fastify.storage.createImageStore(ctx.id);

      let styleReferenceImages: Buffer[] | undefined;
      const styleguideIds = await imageStore.listByRole("persona-avatar-styleguide");
      if (styleguideIds.length > 0) {
        const buffers: Buffer[] = [];
        for (const imageId of styleguideIds) {
          const img = await imageStore.get(imageId);
          if (img) buffers.push(img.buffer);
        }
        if (buffers.length > 0) styleReferenceImages = buffers;
      }

      // Generate the image
      const result = await generatePersonaImage({
        apiKey: provider.apiKey,
        systemPrompt: persona.systemPrompt,
        personaName: persona.name,
        styleReferenceImages,
      });

      // Save via image store and update persona
      const imageId = await imageStore.save(result.imageBase64, "persona-avatar", `${persona.id}.png`);
      const updated = await personas.update(persona.id, { imageUrl: imageId });

      return updated;
    }
  );
}
