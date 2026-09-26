import { z } from "zod";
import { MAX_ASSISTANT_TURN_LENGTH, MAX_HISTORY_MESSAGES } from "../agent/messages";

export const userMessageSchema = z.string().trim().min(1).max(2000);

const historyTurnSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: userMessageSchema }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().trim().min(1).max(MAX_ASSISTANT_TURN_LENGTH),
  }),
]);

export const chatRequestSchema = z.object({
  message: userMessageSchema,
  history: z
    .array(historyTurnSchema)
    .max(MAX_HISTORY_MESSAGES)
    .default([])
    .describe(
      "Earlier turns of the conversation, oldest first, as text. The server keeps no state, so the client sends them with every request.",
    ),
});

export const askQuerySchema = z.object({
  q: userMessageSchema,
});

const tokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      args: z.unknown(),
      result: z.unknown(),
      isError: z.boolean(),
    }),
  ),
  // What the guardrails did during the run, without the text they acted on.
  guardrails: z.array(
    z.object({
      stage: z.enum(["input", "output"]),
      rule: z.string(),
      action: z.string(),
    }),
  ),
  finishReason: z.enum(["stop", "max-steps", "blocked"]),
  usage: tokenUsageSchema.optional(),
});

// Documents the error bodies built in problem.ts (RFC 9457 problem details).
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
