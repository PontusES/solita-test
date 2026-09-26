import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { generateText, Output, wrapLanguageModel, type LanguageModel } from "ai";
import { z } from "zod";
import type { TokenUsage } from "../agent/events";
import { createSecretRedactionMiddleware } from "./middleware";

export const INPUT_REFUSAL =
  "I can't help with that request. If you have an IT problem, describe it and I will look it up, or ask me for the IT Service Desk contact.";

const verdictSchema = z.object({
  category: z.enum(["safe", "prompt_injection", "misuse"]),
  reason: z.string().describe("One sentence explaining the category"),
});

export type InputCategory = z.infer<typeof verdictSchema>["category"];

export interface InputVerdict {
  category: InputCategory;
  reason: string;
  usage?: TokenUsage;
}

// Checks the user's message before the agent runs. An interface, so the loop and its tests do
// not depend on a model.
export interface InputGuard {
  check(message: string, signal: AbortSignal): Promise<InputVerdict>;
}

export interface LlmInputGuardOptions {
  // The classifier's instructions, from prompts/guardrail.md so the prompt improver can tune them.
  instructions: string;
  timeoutMs: number;
}

export class LlmInputGuard implements InputGuard {
  private readonly model: LanguageModel;
  private readonly options: LlmInputGuardOptions;

  constructor(model: LanguageModelV4, options: LlmInputGuardOptions) {
    // The classifier is a model call too, so secrets are redacted before it as well.
    this.model = wrapLanguageModel({ model, middleware: createSecretRedactionMiddleware() });
    this.options = options;
  }

  async check(message: string, signal: AbortSignal): Promise<InputVerdict> {
    const { output, usage } = await generateText({
      model: this.model,
      instructions: this.options.instructions,
      prompt: message,
      output: Output.object({ schema: verdictSchema }),
      // A small classification task: no reasoning needed, and it keeps the added latency low.
      reasoning: "none",
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]),
    });
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    return {
      category: output.category,
      reason: output.reason,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    };
  }
}

export function createLlmInputGuard(
  options: { apiKey: string; modelId: string } & LlmInputGuardOptions,
): InputGuard {
  const openai = createOpenAI({ apiKey: options.apiKey });
  return new LlmInputGuard(openai.chat(options.modelId), options);
}
