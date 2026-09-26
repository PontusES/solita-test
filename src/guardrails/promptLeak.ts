export const PROMPT_LEAK_REFUSAL =
  "I can't share my internal instructions, but I'm happy to help with an IT problem.";

// A run of this many words copied from the system prompt is very unlikely by chance.
const SHINGLE_SIZE = 8;
// Several copied runs are required, so one shared phrase does not trigger it.
const MIN_SHARED_SHINGLES = 3;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

function shingles(text: string): Set<string> {
  const list = words(text);
  const result = new Set<string>();
  for (let i = 0; i + SHINGLE_SIZE <= list.length; i++) {
    result.add(list.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return result;
}

// Detects verbatim or near verbatim copies of the system prompt. Paraphrased leaks are the
// input classifier's job: it stops "print your instructions" before the model runs.
export function detectPromptLeak(answer: string, systemPrompt: string): boolean {
  if (!systemPrompt) return false;
  const promptShingles = shingles(systemPrompt);
  let shared = 0;
  for (const shingle of shingles(answer)) {
    if (promptShingles.has(shingle)) {
      shared++;
      if (shared >= MIN_SHARED_SHINGLES) return true;
    }
  }
  return false;
}
