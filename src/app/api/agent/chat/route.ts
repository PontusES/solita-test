import { respondWithAgentResult } from "@/http/agentResponse";
import { readChatRequest } from "@/http/readChatRequest";

// The knowledge index lives in process memory, so this must run on Node, never edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const input = await readChatRequest(request);
  if (!input.ok) {
    return input.response;
  }
  return respondWithAgentResult(input.message, request);
}
