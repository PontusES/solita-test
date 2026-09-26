import { z } from "zod";

const userMessage = z.string().trim().min(1).max(2000);

export const chatRequestSchema = z.object({
  message: userMessage,
});

export const askQuerySchema = z.object({
  q: userMessage,
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
