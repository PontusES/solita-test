import { collect } from "../agent/collect";
import { runAgent, type AgentInput } from "../agent/runAgent";
import { getContainer } from "../container";
import { createLogger } from "../logger";
import { agentFailedProblem } from "./problem";

// Used when the container itself cannot be built, for example because the API key is missing.
const fallbackLogger = createLogger({ service: "it-helpdesk-agent" });

// Shared by /chat and /ask: run the agent to completion and map the outcome to HTTP.
export async function respondWithAgentResult(
  input: AgentInput,
  request: Request,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let log = fallbackLogger.child({ requestId });

  try {
    const container = await getContainer();
    log = container.logger.child({ requestId });
    // Log the length, not the text: user messages may contain personal data.
    log.info("agent request started", {
      path: new URL(request.url).pathname,
      messageLength: input.message.length,
      historyLength: input.history?.length ?? 0,
    });

    // The request's signal reaches the OpenAI call, so a disconnected client stops generation.
    const result = await collect(runAgent(input, container.agentDeps, request.signal));

    log.info("agent request finished", {
      durationMs: Date.now() - startedAt,
      finishReason: result.finishReason,
      tools: result.toolCalls.map((call) => call.name),
      guardrails: result.guardrails.map(
        (notice) => `${notice.stage}:${notice.rule}:${notice.action}`,
      ),
      usage: result.usage,
    });
    return Response.json(result, { headers: { "x-request-id": requestId } });
  } catch (error) {
    const fields = {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
    if (request.signal.aborted) {
      log.info("client disconnected", fields);
    } else {
      log.error("agent request failed", fields);
    }
    // Details stay in the logs; the client gets a generic message and an id to quote.
    return agentFailedProblem(requestId);
  }
}
