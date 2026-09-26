import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/openapi/route";
import { buildOpenApiSpec } from "@/http/openapi";

describe("GET /api/openapi", () => {
  it("serves the spec as JSON", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual(buildOpenApiSpec());
  });
});
