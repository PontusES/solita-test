import type { z } from "zod";

// Error bodies follow the shape of RFC 9457 "problem details", a common standard for HTTP APIs.
export function problemResponse(
  status: number,
  title: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { type: "about:blank", title, status, ...extra },
    { status, headers: { ...headers, "Content-Type": "application/problem+json" } },
  );
}

export function validationProblem(error: z.ZodError): Response {
  return problemResponse(400, "Invalid request", {
    errors: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

// The public face of any failure during an agent run. Shared by the JSON and SSE endpoints so
// both give clients the same message and a request id to quote; details stay in the logs.
export const AGENT_FAILED_CODE = "agent_failed";
export const AGENT_FAILED_MESSAGE = "The agent could not answer the request.";

export function agentFailedProblem(requestId: string): Response {
  return problemResponse(
    500,
    "Internal Server Error",
    { code: AGENT_FAILED_CODE, detail: AGENT_FAILED_MESSAGE, requestId },
    { "x-request-id": requestId },
  );
}
