import { describe, expect, it } from "vitest";
import { articles } from "@/knowledge/articles";
import { FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";
import { getEscalationContactTool } from "@/tools/getEscalationContact";
import { ToolRegistry } from "@/tools/registry";
import { createSearchKnowledgeBaseTool } from "@/tools/searchKnowledgeBase";

const searchTool = createSearchKnowledgeBaseTool({
  embeddings: new FakeEmbeddingProvider(),
  articles,
  defaultTopK: 3,
  minScore: 0.3,
});

describe("ToolRegistry", () => {
  it("finds tools by name and returns undefined for unknown names", () => {
    const registry = new ToolRegistry([searchTool, getEscalationContactTool]);

    expect(registry.get("search_knowledge_base")).toBe(searchTool);
    expect(registry.get("get_escalation_contact")).toBe(getEscalationContactTool);
    expect(registry.get("delete_everything")).toBeUndefined();
  });

  it("throws on duplicate tool names", () => {
    expect(() => new ToolRegistry([getEscalationContactTool, getEscalationContactTool])).toThrow(
      /Duplicate tool name/,
    );
  });

  it("describes tools to the model as JSON schema without execute", () => {
    const registry = new ToolRegistry([searchTool, getEscalationContactTool]);
    const [search, escalation] = registry.definitions();

    expect(search).toEqual({
      name: "search_knowledge_base",
      description: searchTool.description,
      inputJsonSchema: expect.objectContaining({
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 500 },
          topK: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: ["query"],
      }),
    });
    expect(escalation?.inputJsonSchema).toMatchObject({
      properties: { severity: { type: "string", enum: ["critical", "normal"] } },
      required: ["severity"],
    });
    expect(search).not.toHaveProperty("execute");
  });
});
