import { describe, expect, it } from "vitest";
import { parseConfig } from "@/config";

describe("parseConfig", () => {
  it("applies defaults when only the API key is set", () => {
    expect(parseConfig({ OPENAI_API_KEY: "sk-test" })).toEqual({
      OPENAI_API_KEY: "sk-test",
      AGENT_MAX_STEPS: 5,
      TOOL_TIMEOUT_MS: 10_000,
      KB_TOP_K: 3,
      KB_MIN_SCORE: 0.3,
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    });
  });

  it("coerces numeric strings from the environment", () => {
    const config = parseConfig({
      OPENAI_API_KEY: "sk-test",
      AGENT_MAX_STEPS: "7",
      KB_MIN_SCORE: "0.45",
    });
    expect(config.AGENT_MAX_STEPS).toBe(7);
    expect(config.KB_MIN_SCORE).toBe(0.45);
  });

  it("rejects a missing API key", () => {
    expect(() => parseConfig({})).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects values that are not valid numbers or out of range", () => {
    expect(() => parseConfig({ OPENAI_API_KEY: "sk-test", KB_TOP_K: "many" })).toThrow(/KB_TOP_K/);
    expect(() => parseConfig({ OPENAI_API_KEY: "sk-test", KB_TOP_K: "10" })).toThrow(/KB_TOP_K/);
  });
});
