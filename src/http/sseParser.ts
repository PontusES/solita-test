export interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseBlock(block: string): ParsedSseEvent {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length);
  const data = lines.find((line) => line.startsWith("data: "))?.slice("data: ".length);
  if (!event || !data) {
    throw new Error(`Malformed SSE block: ${block}`);
  }
  return { event, data: JSON.parse(data) };
}

// Reads the events our own stream endpoint writes: "event: x\ndata: {...}" and a blank line.
// Network chunks can end anywhere, so an incomplete block is kept until the rest arrives.
// Used by the chat page, which cannot use EventSource because that only supports GET.
export function createSseParser() {
  let buffer = "";
  return {
    push(chunk: string): ParsedSseEvent[] {
      // SSE allows CRLF line endings; normalizing the whole buffer also joins a split "\r\n".
      buffer = (buffer + chunk).replace(/\r\n/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      return blocks.filter((block) => block.trim() !== "").map(parseBlock);
    },
  };
}

// For a complete body, as in tests.
export function parseSse(body: string): ParsedSseEvent[] {
  return createSseParser().push(`${body}\n\n`);
}
