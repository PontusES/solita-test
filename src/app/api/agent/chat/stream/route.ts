import { runAgent } from "@/agent/runAgent";
import { getContainer, type Container } from "@/container";
import { agentFailedProblem } from "@/http/problem";
import { readChatRequest } from "@/http/readChatRequest";
import { createAgentEventStream, SSE_HEADERS } from "@/http/sse";
import { createLogger } from "@/logger";

export const runtime = "nodejs";

const fallbackLogger = createLogger({ service: "it-helpdesk-agent" });

export async function POST(request: Request): Promise<Response> {
  const body = await readChatRequest(request);
  if (!body.ok) {
    return body.response;
  }
  const { input } = body;

  const requestId = crypto.randomUUID();

  // Everything that can fail before the first byte is handled here, while a real status code
  // can still be sent. Once the stream starts, the status is 200 and errors become events.
  let container: Container;
  try {
    container = await getContainer();
  } catch (error) {
    fallbackLogger.error("agent stream setup failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return agentFailedProblem(requestId);
  }

  const logger = container.logger.child({ requestId });
  logger.info("agent stream started", {
    path: new URL(request.url).pathname,
    messageLength: input.message.length,
    historyLength: input.history.length,
  });

  const events = runAgent(input, container.agentDeps, request.signal);
  const stream = createAgentEventStream(events, { requestId, logger, signal: request.signal });
  return new Response(stream, { headers: { ...SSE_HEADERS, "x-request-id": requestId } });
}
