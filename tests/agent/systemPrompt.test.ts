import { describe, expect, it } from "vitest";
import { loadSystemPrompt } from "@/agent/systemPrompt";

describe("loadSystemPrompt", () => {
  it("loads the versioned prompt, which names both tools", async () => {
    const prompt = await loadSystemPrompt();

    expect(prompt).toContain("search_knowledge_base");
    expect(prompt).toContain("get_escalation_contact");
  });
});
