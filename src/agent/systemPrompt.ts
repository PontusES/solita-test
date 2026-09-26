import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The prompt lives in a file so it is a versioned artifact that the eval runner and the
// prompt improver can swap. Cached per file, since it does not change while running.
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
