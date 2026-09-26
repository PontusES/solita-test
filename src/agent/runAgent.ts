import { z } from "zod";
import type { ToolRegistry } from "../tools/registry";
import type { AgentEvent, TokenUsage } from "./events";
import type { LlmClient } from "./llm/llmClient";
import type { AgentMessage, ToolCall, ToolResult } from "./messages";

export interface AgentDeps {
  llm: LlmClient;
  tools: ToolRegistry;
  systemPrompt: string;
  maxSteps: number;
  toolTimeoutMs: number;
}

export interface AgentInput {
  message: string;
}

const ABORTED: AgentEvent = { type: "error", message: "Request aborted" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addUsage(total: TokenUsage | undefined, step: TokenUsage | undefined) {
  if (!step) return total;
  if (!total) return step;
  return {
    inputTokens: total.inputTokens + step.inputTokens,
    outputTokens: total.outputTokens + step.outputTokens,
    totalTokens: total.totalTokens + step.totalTokens,
  };
}

// The tool gets a signal it can honour, and the race makes sure that a tool which ignores
// its signal still cannot hang the loop.
async function withTimeout<T>(
  signal: AbortSignal,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(
    () => timeout.abort(new Error(`Tool timed out after ${timeoutMs} ms`)),
    timeoutMs,
  );
  const timedOut = new Promise<never>((_, reject) => {
    timeout.signal.addEventListener("abort", () => reject(timeout.signal.reason));
  });
  try {
    return await Promise.race([run(AbortSignal.any([signal, timeout.signal])), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

// Every failure becomes an error result for the model instead of crashing the run, so the
// model can correct its arguments or tell the user what went wrong.
async function executeToolCall(
  call: ToolCall,
  deps: AgentDeps,
  signal: AbortSignal,
): Promise<{ result: unknown; isError: boolean }> {
  const tool = deps.tools.get(call.name);
  if (!tool) {
    return { result: { error: `Unknown tool: ${call.name}` }, isError: true };
  }

  const parsed = tool.inputSchema.safeParse(call.args);
  if (!parsed.success) {
    return {
      result: { error: `Invalid arguments: ${z.prettifyError(parsed.error)}` },
      isError: true,
    };
  }

  try {
    const result = await withTimeout(signal, deps.toolTimeoutMs, (toolSignal) =>
      tool.execute(parsed.data, { signal: toolSignal }),
    );
    return { result, isError: false };
  } catch (error) {
    return { result: { error: errorMessage(error) }, isError: true };
  }
}

export async function* runAgent(
  input: AgentInput,
  deps: AgentDeps,
  signal: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const messages: AgentMessage[] = [{ role: "user", content: input.message }];
  const toolDefinitions = deps.tools.definitions();
  let usage: TokenUsage | undefined;
  // Guardrails can fire on every model call; each distinct notice is reported once per run.
  const reportedGuardrails = new Set<string>();

  try {
    for (let step = 0; step < deps.maxSteps; step++) {
      if (signal.aborted) {
        yield ABORTED;
        return;
      }

      let text = "";
      const toolCalls: ToolCall[] = [];
      const stream = deps.llm.streamStep({
        system: deps.systemPrompt,
        messages,
        tools: toolDefinitions,
        signal,
      });
      for await (const event of stream) {
        switch (event.type) {
          case "text-delta":
            text += event.text;
            yield event;
            break;
          case "tool-call":
            toolCalls.push({ id: event.id, name: event.name, args: event.args });
            break;
          case "guardrail": {
            const key = `${event.stage}:${event.rule}:${event.action}`;
            if (!reportedGuardrails.has(key)) {
              reportedGuardrails.add(key);
              yield event;
            }
            break;
          }
          case "finish":
            usage = addUsage(usage, event.usage);
            break;
        }
      }

      if (toolCalls.length === 0) {
        yield { type: "done", finishReason: "stop", usage };
        return;
      }

      messages.push({ role: "assistant", text, toolCalls });
      const results: ToolResult[] = [];
      for (const call of toolCalls) {
        if (signal.aborted) {
          yield ABORTED;
          return;
        }
        yield { type: "tool-call", ...call };
        const { result, isError } = await executeToolCall(call, deps, signal);
        results.push({ id: call.id, name: call.name, result, isError });
        yield { type: "tool-result", id: call.id, name: call.name, result, isError };
      }
      messages.push({ role: "tool", results });
    }

    // The model still wanted tools after the last allowed step, so it never gave a final answer.
    yield { type: "done", finishReason: "max-steps", usage };
  } catch (error) {
    yield signal.aborted ? ABORTED : { type: "error", message: errorMessage(error) };
  }
}
