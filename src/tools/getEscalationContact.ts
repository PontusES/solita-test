import { z } from "zod";
import type { Tool } from "./tool";

// Authoritative text that must reach the user unchanged. In production this would come
// from the on-call or service desk system; the contact details here are fictional.
export const CRITICAL_ESCALATION_TEXT = [
  "CRITICAL INCIDENT: call the IT on-call line now at +1 555 0100, extension 911. It is staffed 24 hours a day, 7 days a week.",
  "Do not rely on email or the portal for critical incidents.",
  "Have ready: what is affected, how many people are impacted, and when it started.",
  "For a suspected security incident, disconnect the affected device from the network but do not switch it off.",
].join("\n");

export const NORMAL_ESCALATION_TEXT = [
  "IT Service Desk",
  "Email: servicedesk@example.com",
  "Portal: https://support.example.com",
  "Opening hours: Monday to Friday, 08:00 to 17:00.",
  "Include a description of the problem, the steps you have already tried, and any error messages.",
].join("\n");

const inputSchema = z.object({
  severity: z.enum(["critical", "normal"]),
});

type EscalationInput = z.infer<typeof inputSchema>;

export const getEscalationContactTool: Tool<EscalationInput, string> = {
  name: "get_escalation_contact",
  description:
    "Returns the official IT support contact details and escalation procedure. Use when a problem is urgent or critical (system outage affecting many people, security incident), when the user has already tried the troubleshooting steps without success, or when the user asks to talk to a human. Reproduce the returned text exactly.",
  inputSchema,
  async execute(input) {
    return input.severity === "critical" ? CRITICAL_ESCALATION_TEXT : NORMAL_ESCALATION_TEXT;
  },
};
