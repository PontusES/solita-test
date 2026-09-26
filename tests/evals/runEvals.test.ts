import { describe, expect, it } from "vitest";
import type { LlmClient, LlmStepEvent, LlmStepRequest } from "@/agent/llm/llmClient";
import type { AgentDeps } from "@/agent/runAgent";
import { articles } from "@/knowledge/articles";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { getEscalationContactTool } from "@/tools/getEscalationContact";
import { ToolRegistry } from "@/tools/registry";
import { createSearchKnowledgeBaseTool } from "@/tools/searchKnowledgeBase";
import type { EvalCase } from "../../evals/cases";
import type { Judge } from "../../evals/judge";
import { runEvals } from "../../evals/runEvals";

// Unlike FakeLlmClient's single script, this answers based on the user's message, so several
// cases can run concurrently against one client.
class RoutingLlmClient implements LlmClient {
  async *streamStep(req: LlmStepRequest): AsyncIterable<LlmStepEvent> {
    const first = req.messages[0];
    const userMessage = first?.role === "user" ? first.content : "";
    const last = req.messages.at(-1);

    if (userMessage === "explode") {
      throw new Error("model unavailable");
    }
    if (last?.role === "tool") {
      yield { type: "text-delta", text: "Replace the toner cartridge." };
    } else {
      yield {
        type: "tool-call",
        id: "c1",
        name: "search_knowledge_base",
        args: { query: userMessage },
      };
    }
    yield { type: "finish", usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } };
  }
}

class CountingJudge implements Judge {
  calls = 0;
  async judge() {
    this.calls++;
    return {
      score: 0.8,
      reasoning: "good",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  }
}

const deps: AgentDeps = {
  llm: new RoutingLlmClient(),
  tools: new ToolRegistry([
    createSearchKnowledgeBaseTool({
      embeddings: new FakeEmbeddingProvider(),
      articles,
      defaultTopK: 3,
      minScore: 0.1,
    }),
    getEscalationContactTool,
  ]),
  systemPrompt: "test",
  maxSteps: 3,
  toolTimeoutMs: 1_000,
};

const cases: EvalCase[] = [
  {
    id: "printer",
    input: "printer toner cartridge",
    split: "train",
    expect: { toolsCalled: ["search_knowledge_base"], mustContain: ["toner"] },
    rubric: "r",
  },
  {
    id: "greeting",
    input: "hello",
    split: "holdout",
    expect: { toolsNotCalled: ["search_knowledge_base"] },
    rubric: "r",
  },
  { id: "broken", input: "explode", split: "train", expect: {}, rubric: "r" },
];

describe("runEvals", () => {
  it("scores passing cases with the judge and failing ones with 0", async () => {
    const judge = new CountingJudge();

    const report = await runEvals({ cases, deps, judge, runs: 1, concurrency: 2 });
    const [printer, greeting, broken] = report.cases;

    expect(printer).toMatchObject({ id: "printer", meanScore: 0.8, passRate: 1 });
    expect(printer?.runs[0]?.judge).toEqual({ score: 0.8, reasoning: "good" });
    expect(printer?.runs[0]?.searchScores[0]?.length).toBeGreaterThan(0);

    // The deterministic check failed, so the judge was never asked.
    expect(greeting).toMatchObject({ meanScore: 0, passRate: 0 });
    expect(greeting?.runs[0]?.checks.filter((check) => !check.passed)).toEqual([
      { check: "does not call search_knowledge_base", passed: false },
    ]);
    expect(judge.calls).toBe(1);

    // An agent failure is recorded and scored 0 instead of aborting the eval.
    expect(broken?.runs[0]).toMatchObject({ score: 0 });
    expect(broken?.runs[0]?.error).toMatch(/^agent: /);

    expect(report.summary.train).toEqual({ cases: 2, meanScore: 0.4, passRate: 0.5 });
    expect(report.summary.tokens.judge.totalTokens).toBe(2);
  });

  it("runs every case the requested number of times", async () => {
    const report = await runEvals({
      cases: cases.slice(0, 1),
      deps,
      judge: new CountingJudge(),
      runs: 3,
      concurrency: 2,
    });

    expect(report.cases[0]?.runs).toHaveLength(3);
  });
});
