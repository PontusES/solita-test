import { respondWithAgentResult } from "@/http/agentResponse";
import { problemResponse, validationProblem } from "@/http/problem";
import { chatRequestSchema } from "@/http/schemas";

// The knowledge index lives in process memory, so this must run on Node, never edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, "Invalid JSON body");
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationProblem(parsed.error);
  }
  return respondWithAgentResult(parsed.data.message, request);
}
