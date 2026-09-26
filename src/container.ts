import { createOpenAiLlmClient } from "./agent/llm/openAiClient";
import type { AgentDeps } from "./agent/runAgent";
import { loadSystemPrompt } from "./agent/systemPrompt";
import { getConfig } from "./config";
import { articles } from "./knowledge/articles";
import { OpenAiEmbeddingProvider } from "./knowledge/embeddings";
import { createLogger, type Logger } from "./logger";
import { getEscalationContactTool } from "./tools/getEscalationContact";
import { ToolRegistry } from "./tools/registry";
import { createSearchKnowledgeBaseTool } from "./tools/searchKnowledgeBase";

export interface Container {
  agentDeps: AgentDeps;
  logger: Logger;
}

// The only place that reads config and picks real implementations. Everything below it
// receives its dependencies, which is what lets tests swap in fakes.
async function buildContainer(): Promise<Container> {
  const config = getConfig();
  const embeddings = new OpenAiEmbeddingProvider({
    apiKey: config.OPENAI_API_KEY,
    modelId: config.OPENAI_EMBEDDING_MODEL,
  });
  const tools = new ToolRegistry([
    createSearchKnowledgeBaseTool({
      embeddings,
      articles,
      defaultTopK: config.KB_TOP_K,
      minScore: config.KB_MIN_SCORE,
    }),
    getEscalationContactTool,
  ]);

  return {
    agentDeps: {
      llm: createOpenAiLlmClient({
        apiKey: config.OPENAI_API_KEY,
        modelId: config.OPENAI_CHAT_MODEL,
      }),
      tools,
      systemPrompt: await loadSystemPrompt(),
      maxSteps: config.AGENT_MAX_STEPS,
      toolTimeoutMs: config.TOOL_TIMEOUT_MS,
    },
    logger: createLogger({ service: "it-helpdesk-agent" }),
  };
}

let containerPromise: Promise<Container> | undefined;
let testContainer: Container | undefined;

// Built on the first request, not at import time, so `next build` works without an API key.
// The in-memory knowledge index lives inside this container, so it is built once per process.
export function getContainer(): Promise<Container> {
  if (testContainer) {
    return Promise.resolve(testContainer);
  }
  containerPromise ??= buildContainer().catch((error: unknown) => {
    // A missing key should fail each request, not stay cached after it has been fixed.
    containerPromise = undefined;
    throw error;
  });
  return containerPromise;
}

export function setContainerForTests(container: Container | undefined): void {
  testContainer = container;
}
