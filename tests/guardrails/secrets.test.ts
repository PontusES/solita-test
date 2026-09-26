import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/guardrails/secrets";

describe("redactSecrets", () => {
  it.each([
    ["my password is Summer2026!x and VPN fails", "my password is [REDACTED] and VPN fails"],
    ["pwd=hunter2", "pwd=[REDACTED]"],
    ["API key: abc123def456", "API key: [REDACTED]"],
    ["token = eyJhbGciOi", "token = [REDACTED]"],
    ["here sk-live-abcdefghijklmnop1234 fails", "here [REDACTED] fails"],
    ["aws AKIAIOSFODNN7EXAMPLE", "aws [REDACTED]"],
    ["card 4111 1111 1111 1111 declined", "card [REDACTED] declined"],
  ])("redacts %j", (input, expected) => {
    expect(redactSecrets(input)).toEqual({ text: expected, redacted: true });
  });

  it.each([
    "How do I reset my password?",
    "My password expired yesterday",
    "Call +1 555 0100, extension 911",
    // Long, but fails the Luhn checksum, so it is a ticket number and not a card.
    "Ticket 1234 5678 9012 3456 is still open",
  ])("leaves %j alone", (input) => {
    expect(redactSecrets(input)).toEqual({ text: input, redacted: false });
  });
});
