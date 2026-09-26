export const runtime = "nodejs";

// Liveness only. It does not touch config or OpenAI, so it answers even without an API key.
export function GET(): Response {
  return Response.json({ status: "ok" });
}
