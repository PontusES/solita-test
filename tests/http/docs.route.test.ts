import { describe, expect, it } from "vitest";
import { GET } from "@/app/docs/route";

describe("GET /docs", () => {
  it("serves a Swagger UI page for the spec, with pinned and integrity checked assets", async () => {
    const response = GET();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain('url: "/api/openapi"');
    expect(html).toContain(
      "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0/swagger-ui-bundle.js",
    );
    expect(html.match(/integrity="sha384-[A-Za-z0-9+/=]+"/g)).toHaveLength(2);
  });
});
