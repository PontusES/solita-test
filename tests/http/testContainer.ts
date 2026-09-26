import { FakeLlmClient } from "@/agent/llm/fakeLlmClient";
import type { InputGuard } from "@/guardrails/inputGuard";
import type { LlmStepEvent } from "@/agent/llm/llmClient";
import { setContainerForTests } from "@/container";
import { articles } from "@/knowledge/articles";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { silentLogger } from "@/logger";
import { getEscalationContactTool } from "@/tools/getEscalationContact";
import { ToolRegistry } from "@/tools/registry";
import { createSearchKnowledgeBaseTool } from "@/tools/searchKnowledgeBase";

export const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

// Real tools and loop, with the network-facing parts (LLM, embeddings) replaced by fakes.
export function useFakeContainer(steps: LlmStepEvent[][], inputGuard?: InputGuard): FakeLlmClient {
  const llm = new FakeLlmClient(steps);
  setContainerForTests({
    agentDeps: {
      llm,
      tools: new ToolRegistry([
        createSearchKnowledgeBaseTool({
          embeddings: new FakeEmbeddingProvider(),
          articles,
          defaultTopK: 3,
          minScore: 0.1,
        }),
        getEscalationContactTool,
      ]),
      systemPrompt: "test prompt",
      maxSteps: 5,
      toolTimeoutMs: 1_000,
      inputGuard,
    },
    logger: silentLogger,
  });
  return llm;
}

// A search followed by an answer: the typical successful run.
export const searchThenAnswer: LlmStepEvent[][] = [
  [
    {
      type: "tool-call",
      id: "c1",
      name: "search_knowledge_base",
      args: { query: "printer toner cartridge" },
    },
    { type: "finish", usage },
  ],
  [
    { type: "text-delta", text: "Replace the toner cartridge." },
    { type: "finish", usage },
  ],
];
