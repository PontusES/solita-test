import { z } from "zod";
import { AGENT_FAILED_CODE, AGENT_FAILED_MESSAGE } from "./problem";
import { chatRequestSchema, chatResponseSchema, problemSchema, userMessageSchema } from "./schemas";

// Zod emits JSON Schema draft 2020-12, the schema dialect of OpenAPI 3.1, so the docs are
// generated from the same schemas the routes validate with and cannot drift from them.
function toSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema, { io });
  // The dialect is already implied by OpenAPI 3.1, so the key is only noise inside the spec.
  delete jsonSchema.$schema;
  return jsonSchema;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const chatResponseExample = {
  answer:
    'Replace the toner cartridge. Based on "Printer output is empty or faded": check that the cartridge is seated firmly...',
  toolCalls: [
    {
      name: "search_knowledge_base",
      args: { query: "printer prints blank pages" },
      result: {
        results: [
          {
            id: "kb-printer-blank-pages",
            title: "Printer output is empty or faded",
            content:
              "When a network printer feeds paper but the sheets come out without any print...",
            score: 0.633,
          },
        ],
      },
      isError: false,
    },
  ],
  finishReason: "stop",
  usage: { inputTokens: 1136, outputTokens: 109, totalTokens: 1245 },
};

const problemResponses = {
  "400": {
    description: "Invalid JSON or input that fails validation.",
    content: {
      "application/problem+json": {
        schema: ref("Problem"),
        example: {
          type: "about:blank",
          title: "Invalid request",
          status: 400,
          errors: [
            { path: "message", message: "Too small: expected string to have >=1 characters" },
          ],
        },
      },
    },
  },
  "500": {
    description: "The agent failed. Details are only in the server log, under the request id.",
    content: {
      "application/problem+json": {
        schema: ref("Problem"),
        example: {
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
          code: AGENT_FAILED_CODE,
          detail: AGENT_FAILED_MESSAGE,
          requestId: "0b9e6c1e-5f5a-4a57-9c52-2b1f8a0f7d11",
        },
      },
    },
  },
};

const chatJsonResponse = {
  description: "The agent's answer and a trace of every tool call it made.",
  headers: { "x-request-id": { schema: { type: "string" } } },
  content: { "application/json": { schema: ref("ChatResponse"), example: chatResponseExample } },
};

const streamDescription = `One Server-Sent Event per agent event, as \`event: <type>\` plus a JSON \`data\` line:

- \`tool-call\`: \`{ id, name, args }\`
- \`tool-result\`: \`{ id, name, result, isError }\`
- \`text-delta\`: \`{ text }\`, a piece of the answer
- \`done\`: \`{ finishReason, usage }\`, always the last event of a successful run
- \`error\`: \`{ code: "${AGENT_FAILED_CODE}", message, requestId }\`, sent instead of \`done\` if the run fails

Swagger UI only shows the body after the stream has ended. To watch events arrive, use \`curl -N\`.`;

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "IT Helpdesk Agent API",
      version: "1.0.0",
      description:
        "An internal IT helpdesk agent. It searches a knowledge base of troubleshooting articles and returns official escalation contacts. Errors use application/problem+json; every agent response has an x-request-id header that matches the server log.",
    },
    servers: [{ url: "/" }],
    // Stated explicitly: there is no authentication yet (see SHORTCUTS.md).
    security: [],
    tags: [
      { name: "agent", description: "Ask the helpdesk agent" },
      { name: "ops", description: "Operations" },
    ],
    paths: {
      "/api/agent/chat": {
        post: {
          tags: ["agent"],
          operationId: "chat",
          summary: "Ask the agent and get the full answer as JSON",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("ChatRequest"),
                example: { message: "The printer only prints blank white pages" },
              },
            },
          },
          responses: { "200": chatJsonResponse, ...problemResponses },
        },
      },
      "/api/agent/chat/stream": {
        post: {
          tags: ["agent"],
          operationId: "chatStream",
          summary: "Ask the agent and stream its events as Server-Sent Events",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("ChatRequest"),
                example: { message: "The mail server is down for the whole office" },
              },
            },
          },
          responses: {
            "200": {
              description: streamDescription,
              headers: { "x-request-id": { schema: { type: "string" } } },
              content: {
                "text/event-stream": {
                  schema: { type: "string" },
                  example:
                    'event: tool-call\ndata: {"type":"tool-call","id":"call_1","name":"get_escalation_contact","args":{"severity":"critical"}}\n\nevent: text-delta\ndata: {"type":"text-delta","text":"Call the on-call line"}\n\nevent: done\ndata: {"type":"done","finishReason":"stop"}\n\n',
                },
              },
            },
            ...problemResponses,
          },
        },
      },
      "/api/agent/ask": {
        get: {
          tags: ["agent"],
          operationId: "ask",
          summary: "Browser friendly GET variant of /api/agent/chat",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "The question to ask.",
              schema: toSchema(userMessageSchema, "input"),
              example: "my laptop is really slow",
            },
          ],
          responses: {
            "200": chatJsonResponse,
            "400": problemResponses["400"],
            "500": problemResponses["500"],
          },
        },
      },
      "/api/health": {
        get: {
          tags: ["ops"],
          operationId: "health",
          summary: "Liveness check, works without an API key",
          responses: {
            "200": {
              description: "The server is running.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { status: { const: "ok" } },
                    required: ["status"],
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ChatRequest: toSchema(chatRequestSchema, "input"),
        ChatResponse: toSchema(chatResponseSchema, "output"),
        Problem: toSchema(problemSchema, "output"),
      },
    },
  };
}
