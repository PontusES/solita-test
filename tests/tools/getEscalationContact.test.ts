import { describe, expect, it } from "vitest";
import {
  CRITICAL_ESCALATION_TEXT,
  getEscalationContactTool,
  NORMAL_ESCALATION_TEXT,
} from "@/tools/getEscalationContact";

const ctx = { signal: new AbortController().signal };

describe("get_escalation_contact", () => {
  it("returns the exact critical text", async () => {
    await expect(getEscalationContactTool.execute({ severity: "critical" }, ctx)).resolves.toBe(
      CRITICAL_ESCALATION_TEXT,
    );
  });

  it("returns the exact normal text", async () => {
    await expect(getEscalationContactTool.execute({ severity: "normal" }, ctx)).resolves.toBe(
      NORMAL_ESCALATION_TEXT,
    );
  });

  it("rejects an unknown or missing severity", () => {
    const { inputSchema } = getEscalationContactTool;

    expect(inputSchema.safeParse({ severity: "urgent" }).success).toBe(false);
    expect(inputSchema.safeParse({}).success).toBe(false);
  });
});
