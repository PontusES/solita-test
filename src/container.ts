import { createOpenAiLlmClient } from "./agent/llm/openAiClient";
import type { AgentDeps } from "./agent/runAgent";
import { loadPromptSet, type PromptSet } from "./agent/systemPrompt";
import { getConfig, type Config } from "./config";
import { createLlmInputGuard } from "./guardrails/inputGuard";
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

// The production wiring of the agent. Used by the HTTP container and by the eval runner,
// which passes different prompts but must otherwise test exactly what runs in production.
export function createAgentDeps(config: Config, prompts: PromptSet): AgentDeps {
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
    llm: createOpenAiLlmClient({
      apiKey: config.OPENAI_API_KEY,
      modelId: config.OPENAI_CHAT_MODEL,
    }),
    tools,
    systemPrompt: prompts.system,
    maxSteps: config.AGENT_MAX_STEPS,
    toolTimeoutMs: config.TOOL_TIMEOUT_MS,
    inputGuard: createLlmInputGuard({
      apiKey: config.OPENAI_API_KEY,
      modelId: config.GUARDRAIL_MODEL,
      instructions: prompts.guardrail,
      timeoutMs: config.GUARDRAIL_TIMEOUT_MS,
    }),
  };
}

// The only place that reads config and picks real implementations. Everything below it
// receives its dependencies, which is what lets tests swap in fakes.
async function buildContainer(): Promise<Container> {
  const config = getConfig();
  return {
    agentDeps: createAgentDeps(config, await loadPromptSet()),
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
