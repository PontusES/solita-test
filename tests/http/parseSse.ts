export interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

// Minimal SSE reader for tests: every event is "event: x\ndata: {...}" followed by a blank line.
export function parseSse(body: string): ParsedSseEvent[] {
  return body
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length);
      const data = lines.find((line) => line.startsWith("data: "))?.slice("data: ".length);
      if (!event || !data) {
        throw new Error(`Malformed SSE block: ${block}`);
      }
      return { event, data: JSON.parse(data) };
    });
}
