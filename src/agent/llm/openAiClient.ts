import { createOpenAI } from "@ai-sdk/openai";
import {
  jsonSchema,
  streamText,
  tool,
  type JSONSchema7,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { ToolDefinition } from "../../tools/tool";
import type { AgentMessage } from "../messages";
import type { LlmClient, LlmStepEvent, LlmStepRequest } from "./llmClient";

// Tool results are plain objects or strings; the round trip guarantees a JSON-safe value.
function toJsonValue(value: unknown): JSONValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JSONValue;
}

export function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    switch (message.role) {
      case "user":
        return { role: "user", content: message.content };
      case "assistant":
        return {
          role: "assistant",
          content: [
            ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
            ...message.toolCalls.map((call) => ({
              type: "tool-call" as const,
              toolCallId: call.id,
              toolName: call.name,
              input: call.args,
            })),
          ],
        };
      case "tool":
        return {
          role: "tool",
          content: message.results.map((result) => ({
            type: "tool-result" as const,
            toolCallId: result.id,
            toolName: result.name,
            output: result.isError
              ? { type: "error-json" as const, value: toJsonValue(result.result) }
              : { type: "json" as const, value: toJsonValue(result.result) },
          })),
        };
    }
  });
}

// No execute on purpose: the SDK then stops after one step and hands the tool calls back to us.
function toToolSet(definitions: ToolDefinition[]): ToolSet {
  const tools: ToolSet = {};
  for (const definition of definitions) {
    tools[definition.name] = tool({
      description: definition.description,
      // Zod emits standard JSON Schema; the two libraries just use different type names for it.
      inputSchema: jsonSchema(definition.inputJsonSchema as JSONSchema7),
    });
  }
  return tools;
}

export class OpenAiLlmClient implements LlmClient {
  private readonly model: LanguageModel;

  constructor(model: LanguageModel) {
    this.model = model;
  }

  async *streamStep(req: LlmStepRequest): AsyncIterable<LlmStepEvent> {
    const result = streamText({
      model: this.model,
      instructions: req.system,
      messages: toModelMessages(req.messages),
      tools: toToolSet(req.tools),
      abortSignal: req.signal,
      // gpt-6-luna only supports function calling on Chat Completions without reasoning.
      reasoning: "none",
    });

    for await (const part of result.stream) {
      switch (part.type) {
        case "text-delta":
          yield { type: "text-delta", text: part.text };
          break;
        case "tool-call":
          // Invalid calls are forwarded too; the loop validates them and reports the error.
          yield { type: "tool-call", id: part.toolCallId, name: part.toolName, args: part.input };
          break;
        case "finish": {
          const inputTokens = part.totalUsage.inputTokens ?? 0;
          const outputTokens = part.totalUsage.outputTokens ?? 0;
          yield {
            type: "finish",
            usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          };
          break;
        }
        case "error":
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        case "abort":
          throw new Error("LLM request aborted");
      }
    }
  }
}

export function createOpenAiLlmClient(options: { apiKey: string; modelId: string }): LlmClient {
  const openai = createOpenAI({ apiKey: options.apiKey });
  // Chat Completions is stateless, so our own message history maps onto it directly.
  return new OpenAiLlmClient(openai.chat(options.modelId));
}
