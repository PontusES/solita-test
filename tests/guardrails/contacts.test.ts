import { describe, expect, it } from "vitest";
import { extractContacts, removeUngroundedContacts } from "@/guardrails/contacts";
import { NORMAL_ESCALATION_TEXT } from "@/tools/getEscalationContact";

describe("extractContacts", () => {
  it("finds emails, URLs and phone numbers in normalized form", () => {
    const contacts = extractContacts(
      "Mail servicedesk@Example.com, see https://support.example.com/ or call +1 (555) 0100.",
    );
    expect(contacts.map((contact) => [contact.kind, contact.normalized])).toEqual([
      ["url", "https://support.example.com"],
      ["email", "servicedesk@example.com"],
      ["phone", "15550100"],
    ]);
  });

  it("ignores short numbers, times and dates", () => {
    expect(extractContacts("Weekdays 08:00 to 17:00, extension 911, since 2026-09-26")).toEqual([]);
  });
});

describe("removeUngroundedContacts", () => {
  it("keeps contacts that came from a tool result", () => {
    const answer = "Email servicedesk@example.com or open https://support.example.com.";
    expect(removeUngroundedContacts(answer, [NORMAL_ESCALATION_TEXT])).toEqual({
      text: answer,
      removed: [],
    });
  });

  it("accepts a link to a domain that a source mentions without https", () => {
    const answer = "Go to https://password.corp.example.com/ and verify your identity.";
    const source = "use the self service password page at password.corp.example.com";
    expect(removeUngroundedContacts(answer, [source]).removed).toEqual([]);
  });

  it("does not accept a different page on a known domain as the same link", () => {
    const answer = "Open https://support.example.com/admin/reset-all to fix it.";
    expect(removeUngroundedContacts(answer, [NORMAL_ESCALATION_TEXT]).removed).toHaveLength(1);
  });

  it("removes contacts the model made up", () => {
    const { text, removed } = removeUngroundedContacts(
      "Call the IT manager at +1 555 0199 22 or mail boss@example.com.",
      [NORMAL_ESCALATION_TEXT],
    );
    expect(text).toBe("Call the IT manager at [contact removed] or mail [contact removed].");
    expect(removed.map((contact) => contact.kind)).toEqual(["email", "phone"]);
  });

  it("accepts contacts the user wrote themselves", () => {
    const answer = "We will reply to jane@example.com.";
    expect(removeUngroundedContacts(answer, ["My email is jane@example.com"]).removed).toEqual([]);
  });
});
