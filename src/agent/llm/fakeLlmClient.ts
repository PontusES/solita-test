import type { LlmClient, LlmStepEvent, LlmStepRequest } from "./llmClient";

// Tests only. Replays one scripted list of events per model call and records what the
// loop sent, so tests can assert exactly what the model would have seen.
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmStepRequest[] = [];
  private readonly steps: LlmStepEvent[][];

  constructor(steps: LlmStepEvent[][]) {
    this.steps = steps;
  }

  async *streamStep(req: LlmStepRequest): AsyncIterable<LlmStepEvent> {
    // Copy the messages, because the loop keeps appending to the same array.
    this.requests.push({ ...req, messages: structuredClone(req.messages) });
    const step = this.steps[this.requests.length - 1];
    if (!step) {
      throw new Error(`FakeLlmClient: no scripted step ${this.requests.length}`);
    }
    yield* step;
  }
}
