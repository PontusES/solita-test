import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The prompts live in files so they are versioned artifacts that the eval runner and the
// prompt improver can swap. Cached per file, since they do not change while running.
const cache = new Map<string, Promise<string>>();

// `fileName` is relative to the prompts folder, for example "system.md" or "candidates/x.md".
// Keeping the path scoped to that folder lets Next.js trace only the prompts into the build
// output, instead of the whole project.
export function loadSystemPrompt(fileName: string = "system.md"): Promise<string> {
  const absolutePath = join(process.cwd(), "prompts", fileName);
  let prompt = cache.get(absolutePath);
  if (!prompt) {
    prompt = readFile(absolutePath, "utf8").then((text) => text.trim());
    cache.set(absolutePath, prompt);
  }
  return prompt;
}

// The two prompts that shape the agent's behaviour: the agent's own instructions and the input
// guardrail classifier's. They are versioned and improved together as one set.
export interface PromptSet {
  system: string;
  guardrail: string;
}

export async function loadPromptSet(): Promise<PromptSet> {
  const [system, guardrail] = await Promise.all([
    loadSystemPrompt("system.md"),
    loadSystemPrompt("guardrail.md"),
  ]);
  return { system, guardrail };
}
