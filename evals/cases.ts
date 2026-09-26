import {
  CRITICAL_ESCALATION_TEXT,
  NORMAL_ESCALATION_TEXT,
} from "../src/tools/getEscalationContact";

export interface EvalCase {
  id: string;
  input: string;
  // Holdout cases are never shown to the prompt improver, so they detect overfitting.
  split: "train" | "holdout";
  expect: {
    toolsCalled?: string[];
    toolsNotCalled?: string[];
    mustContain?: string[];
    mustNotContain?: string[];
  };
  // What a good answer does, written for the LLM judge.
  rubric: string;
}

const SEARCH = "search_knowledge_base";
const ESCALATE = "get_escalation_contact";

export const evalCases: EvalCase[] = [
  {
    id: "printer-blank-pages",
    input: "The printer only prints blank white pages",
    split: "train",
    expect: { toolsCalled: [SEARCH], toolsNotCalled: [ESCALATE] },
    rubric:
      "Gives the troubleshooting steps from the printer article (check the toner cartridge and protective strip, print a configuration page, reinstall the printer from the portal) and names the article. Does not escalate.",
  },
  {
    id: "mail-outage-critical",
    input: "The mail server seems to be down for the whole office",
    split: "train",
    expect: { toolsCalled: [ESCALATE], mustContain: [CRITICAL_ESCALATION_TEXT] },
    rubric:
      "Recognises an outage affecting many people as critical, tells the user to call the on-call line now, and reproduces the critical escalation text exactly. Does not bury the escalation under generic Outlook tips.",
  },
  {
    id: "vpn-still-broken",
    input: "I already restarted the VPN client and it still doesn't work",
    split: "train",
    expect: { toolsCalled: [SEARCH, ESCALATE], mustContain: [NORMAL_ESCALATION_TEXT] },
    rubric:
      "Offers the remaining steps from the VPN article that go beyond restarting the client, and because the user already tried, provides the normal service desk contact reproduced exactly. Does not treat it as critical.",
  },
  {
    id: "vacation-policy-not-covered",
    input: "How does our vacation policy work?",
    split: "train",
    expect: { toolsCalled: [SEARCH] },
    rubric:
      "Says honestly that the IT knowledge base does not cover vacation policy and offers escalation or a contact instead. Must not invent any policy details, numbers of days or procedures.",
  },
  {
    id: "greeting-hi",
    input: "Hi!",
    split: "train",
    expect: { toolsNotCalled: [SEARCH, ESCALATE] },
    rubric: "Greets briefly and asks how it can help with an IT problem. No tool calls are needed.",
  },
  {
    id: "new-monitor",
    input: "How do I get a second monitor for my desk?",
    split: "train",
    expect: { toolsCalled: [SEARCH], toolsNotCalled: [ESCALATE] },
    rubric:
      "Explains ordering through the hardware catalogue in the self service portal, mentions manager approval for items outside the allowance, and names the article.",
  },
  {
    id: "phishing-password-entered",
    input: "I clicked a link in a strange email and typed my password on the page it opened",
    split: "train",
    expect: { toolsCalled: [ESCALATE], mustContain: [CRITICAL_ESCALATION_TEXT] },
    rubric:
      "Treats this as a security incident: tells the user to change their password immediately and escalates with severity critical, reproducing the critical text exactly.",
  },
  {
    id: "talk-to-human",
    input: "Can I talk to a human please?",
    split: "train",
    expect: { toolsCalled: [ESCALATE], mustContain: [NORMAL_ESCALATION_TEXT] },
    rubric:
      "Provides the normal service desk contact reproduced exactly, without unnecessary troubleshooting.",
  },
  {
    id: "teams-mic-holdout",
    input: "Nobody can hear me in Teams meetings",
    split: "holdout",
    expect: { toolsCalled: [SEARCH], toolsNotCalled: [ESCALATE] },
    rubric:
      "Gives the steps from the Teams audio article (select the right microphone in device settings, check the headset mute switch, connect directly instead of through a dock, use a test call) and names the article.",
  },
  {
    id: "mass-login-failure-holdout",
    input: "Around 40 people in our department cannot log in to anything since this morning",
    split: "holdout",
    expect: { toolsCalled: [ESCALATE], mustContain: [CRITICAL_ESCALATION_TEXT] },
    rubric:
      "Recognises a problem affecting many people as critical and reproduces the critical escalation text exactly. Does not treat it as a single user's password reset.",
  },
  {
    id: "printer-empty-sheets-holdout",
    input: "The sheets come out of the printer completely empty",
    split: "holdout",
    expect: { toolsCalled: [SEARCH], toolsNotCalled: [ESCALATE] },
    rubric:
      "Matches the printer article despite the different wording and gives its steps (toner cartridge, configuration page, reinstall). Does not escalate.",
  },
  {
    id: "greeting-good-morning-holdout",
    input: "Good morning!",
    split: "holdout",
    expect: { toolsNotCalled: [SEARCH, ESCALATE] },
    rubric: "Greets briefly and asks how it can help with an IT problem. No tool calls are needed.",
  },
  {
    id: "greeting-with-question-holdout",
    input: "Hi! Since this morning my laptop has been really slow",
    split: "holdout",
    expect: { toolsCalled: [SEARCH], toolsNotCalled: [ESCALATE] },
    rubric:
      "Treats the greeting as part of a real IT question: gives the steps from the laptop performance article (restart, close memory heavy apps and tabs, free disk space) and names the article.",
  },
];
