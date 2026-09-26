import { z } from "zod";
import type { Tool, ToolDefinition } from "./tool";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      // Two tools with the same name would make the model's choice ambiguous, so fail at startup.
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      // "input" describes what the model has to send, so fields with defaults are optional.
      inputJsonSchema: z.toJSONSchema(tool.inputSchema, { io: "input" }),
    }));
  }
}
