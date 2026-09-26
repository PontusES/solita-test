import { problemResponse, validationProblem } from "./problem";
import { chatRequestSchema } from "./schemas";

export type ChatRequestResult = { ok: true; message: string } | { ok: false; response: Response };

// Shared by /chat and /chat/stream, so both reject bad input the same way.
export async function readChatRequest(request: Request): Promise<ChatRequestResult> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: problemResponse(400, "Invalid JSON body") };
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: validationProblem(parsed.error) };
  }
  return { ok: true, message: parsed.data.message };
}
