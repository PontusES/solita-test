// What a guardrail did, reported to clients and logs. Never contains the offending text itself.
export type GuardrailRule =
  | "secret"
  | "ungrounded-contact"
  | "prompt-leak"
  | "prompt_injection"
  | "misuse"
  | "classifier-error";

export type GuardrailAction = "redacted" | "removed" | "replaced" | "blocked" | "allowed";

export interface GuardrailNotice {
  stage: "input" | "output";
  rule: GuardrailRule;
  action: GuardrailAction;
}
