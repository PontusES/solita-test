import { describe, expect, it } from "vitest";
import { z } from "zod";
import { problemResponse, validationProblem } from "@/http/problem";

describe("problemResponse", () => {
  it("builds a problem details response", async () => {
    const response = problemResponse(
      404,
      "Not Found",
      { detail: "Nope" },
      { "x-request-id": "r1" },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("x-request-id")).toBe("r1");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "Nope",
    });
  });
});

describe("validationProblem", () => {
  it("maps every zod issue to a path and message", async () => {
    const result = z.object({ a: z.string(), b: z.object({ c: z.number() }) }).safeParse({ b: {} });
    if (result.success) throw new Error("expected a validation failure");

    const body = await validationProblem(result.error).json();

    expect(body.status).toBe(400);
    expect(body.errors.map((error: { path: string }) => error.path)).toEqual(["a", "b.c"]);
  });
});
