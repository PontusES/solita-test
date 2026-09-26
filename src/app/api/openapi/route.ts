import { buildOpenApiSpec } from "@/http/openapi";

export const runtime = "nodejs";

// Pure and constant, so it is built once when the module loads.
const spec = buildOpenApiSpec();

export function GET(): Response {
  return Response.json(spec);
}
