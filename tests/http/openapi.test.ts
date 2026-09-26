import { describe, expect, it } from "vitest";
import { buildOpenApiSpec, chatResponseExample } from "@/http/openapi";
import { chatResponseSchema } from "@/http/schemas";

const spec = buildOpenApiSpec();

describe("buildOpenApiSpec", () => {
  it("is OpenAPI 3.1 and documents exactly the API routes", () => {
    expect(spec.openapi).toBe("3.1.0");

    const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual([
      "GET /api/agent/ask",
      "GET /api/health",
      "POST /api/agent/chat",
      "POST /api/agent/chat/stream",
    ]);
  });

  it("derives the request schema from the validation schema the route uses", () => {
    const schema = spec.components.schemas.ChatRequest as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.properties.message).toEqual({ type: "string", minLength: 1, maxLength: 2000 });
    // history has a default, so in the input direction it is optional.
    expect(schema.required).toEqual(["message"]);
    expect(schema.properties.history).toMatchObject({ type: "array", maxItems: 20 });
  });

  it("leaves the JSON Schema dialect key out of the embedded schemas", () => {
    expect(JSON.stringify(spec)).not.toContain('"$schema"');
  });

  it("has a response example that matches the real response schema", () => {
    expect(chatResponseSchema.safeParse(chatResponseExample).success).toBe(true);
  });

  it("documents the stream as Server-Sent Events", () => {
    const streamOk = spec.paths["/api/agent/chat/stream"].post.responses["200"];
    expect(Object.keys(streamOk.content)).toEqual(["text/event-stream"]);
  });
});
