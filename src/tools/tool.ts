import type { z } from "zod";

export interface ToolContext {
  signal: AbortSignal;
}

// `execute` uses method syntax on purpose: TypeScript checks method parameters bivariantly,
// so a Tool<SearchInput, SearchOutput> can be stored in a plain Tool[] without `any`.
export interface Tool<I = unknown, O = unknown> {
  name: string;
  // Drives the model's choice of tool, so it is written for the model, not for humans.
  description: string;
  inputSchema: z.ZodType<I>;
  execute(input: I, ctx: ToolContext): Promise<O>;
}

// What the model is told about a tool. Deliberately has no execute.
export interface ToolDefinition {
  name: string;
  description: string;
  inputJsonSchema: Record<string, unknown>;
}
