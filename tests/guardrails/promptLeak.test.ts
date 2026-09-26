import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectPromptLeak } from "@/guardrails/promptLeak";

const systemPrompt = readFileSync("prompts/system.md", "utf8");

describe("detectPromptLeak", () => {
  it("detects a verbatim copy of the instructions", () => {
    expect(detectPromptLeak(`Sure! My rules are:\n${systemPrompt}`, systemPrompt)).toBe(true);
  });

  it("detects a partial copy of several sentences", () => {
    const excerpt = systemPrompt.split("\n").slice(4, 8).join("\n");
    expect(detectPromptLeak(excerpt, systemPrompt)).toBe(true);
  });

  it("does not flag a normal answer that shares a few words", () => {
    const answer =
      'Based on the article "VPN and remote access troubleshooting", sign out of the client and start it again. Do not invent settings.';
    expect(detectPromptLeak(answer, systemPrompt)).toBe(false);
  });
});
