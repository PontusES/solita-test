import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const DEFAULT_SYSTEM_PROMPT_PATH = "prompts/system.md";

// The prompt lives in a file so it is a versioned artifact that the eval runner and the
// prompt improver can swap. Cached per path, since it does not change while running.
const cache = new Map<string, Promise<string>>();

export function loadSystemPrompt(path: string = DEFAULT_SYSTEM_PROMPT_PATH): Promise<string> {
  const absolutePath = resolve(process.cwd(), path);
  let prompt = cache.get(absolutePath);
  if (!prompt) {
    prompt = readFile(absolutePath, "utf8").then((text) => text.trim());
    cache.set(absolutePath, prompt);
  }
  return prompt;
}
