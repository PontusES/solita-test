import { z } from "zod";

// Env values are always strings, so numbers are coerced and then range checked.
const configSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(5),
  TOOL_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  KB_TOP_K: z.coerce.number().int().min(1).max(5).default(3),
  // Calibrated with the eval runner: relevant articles scored 0.55 to 0.70, unrelated ones up to 0.44.
  KB_MIN_SCORE: z.coerce.number().min(-1).max(1).default(0.5),
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-6-luna"),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  GUARDRAIL_MODEL: z.string().min(1).default("gpt-6-luna"),
  GUARDRAIL_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
  // Only used by the eval runner and the prompt improver.
  EVAL_JUDGE_MODEL: z.string().min(1).default("gpt-6-sol"),
  EVAL_OPTIMIZER_MODEL: z.string().min(1).default("gpt-6-sol"),
});

export type Config = z.infer<typeof configSchema>;

type Env = Record<string, string | undefined>;

export function parseConfig(env: Env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cachedConfig: Config | undefined;

// Parsed on first use instead of at import time, so `next build` works without an API key.
export function getConfig(): Config {
  cachedConfig ??= parseConfig(process.env);
  return cachedConfig;
}
