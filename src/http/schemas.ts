import { z } from "zod";

export const userMessageSchema = z.string().trim().min(1).max(2000);

export const chatRequestSchema = z.object({
  message: userMessageSchema,
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
  finishReason: z.enum(["stop", "max-steps"]),
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
