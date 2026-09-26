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
