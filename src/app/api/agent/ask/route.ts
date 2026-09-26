import { respondWithAgentResult } from "@/http/agentResponse";
import { validationProblem } from "@/http/problem";
import { askQuerySchema } from "@/http/schemas";

export const runtime = "nodejs";

// Browser friendly variant of /chat: GET /api/agent/ask?q=... returns the same JSON.
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get("q") ?? undefined;

  const parsed = askQuerySchema.safeParse({ q });
  if (!parsed.success) {
    return validationProblem(parsed.error);
  }
  return respondWithAgentResult({ message: parsed.data.q }, request);
}
