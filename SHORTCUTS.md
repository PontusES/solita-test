# Shortcuts

The 3 hour cap was treated as the customer's budget. Each priority was finished before the next one started, so there was always something complete and working.

| Priority      | Scope                                                                    | Status           |
| ------------- | ------------------------------------------------------------------------ | ---------------- |
| P0            | Vector store, two tools, agent loop, JSON and SSE endpoints, tests, docs | Built            |
| P1            | OpenAPI spec and Swagger UI, eval runner                                 | Built            |
| P2            | Prompt self-improver                                                     | Built            |
| Beyond budget | Guardrails, retrieval evals, CI, chat page, follow up questions          | Built on request |

## Left unbuilt on purpose

These are the next steps I would take. Each builds on something that already exists.

**1. Conversation memory on the server.** Today the client sends the last 20 turns with every request. Next: a `conversationId`, with turns stored in Postgres per SSO user. Storing the tool results too means the history cannot be forged and a follow up can reuse the articles already found. Older turns are summarised instead of dropped, and a retention period applies.

**2. Unanswered questions to support.** The agent already knows when every search came back empty. Store those questions with personal data stripped, cluster them weekly with the existing embeddings, and send support "23 questions about Windows Update" in their own ticket queue. When they write the article, the questions become retrieval eval cases for it, so the fix is measured.

**3. OpenTelemetry tracing.** `registerOTel` in `instrumentation.ts`, as the Next.js guide describes. Our own spans for the run, each model step, each tool and the input guard, plus the AI SDK's `telemetry` option for the model calls. `recordInputs` and `recordOutputs` are off, because questions can contain personal data. The first things to watch are time to first token, cost per request and how often each guardrail fires.

**4. Tool approval.** Not needed while both tools only read. It becomes necessary for tools that act, such as resetting a password or creating a ticket:

- a `requiresApproval` flag on the tool, which the model cannot change;
- the loop pauses with a `tool-approval-request` event;
- the approval comes back signed (HMAC), since the server is stateless;
- a denial goes back to the model as an error result;
- every approved action is audit logged.

## Shortcuts taken

Each line is the shortcut, then what comes next.

**Data and retrieval**

- In-memory vector store, embedded again on every start, one per process. Next: pgvector or Azure AI Search, with embeddings computed at ingest.
- 12 hand-written articles, one embedding each. Next: ingest the real wiki, split into chunks.
- `KB_MIN_SCORE` 0.5 is too strict for raw user wording: the retrieval evals show it cuts 43% of relevant hits. The answer evals still pass because the agent rewrites the query before searching. Next: choose the threshold from the agent's real queries, and add a reranker.
- Escalation contacts are hardcoded constants. Next: read them from the service desk system.

**Security**

- No authentication and no rate or cost limits. Next: SSO (OIDC) with the user's identity in tools and logs, plus a rate limit and token budget per user.
- The client sends the conversation history, unsigned. Forging it only affects the sender's own session, and tool results are never accepted from clients. Next: item 1 above.

**Agent**

- Tools run one after another. Next: run independent calls in parallel.
- If the model still calls tools on the last allowed step, the run ends with `max-steps` and no answer. Next: one final call with tools disabled.
- Logging is JSON lines through `console`. Next: pino, and item 3 above.

**Guardrails**

- Secret detection is pattern based, so a bare password with no keyword gets through. Next: a DLP service or dedicated secret scanner.
- The grounding check covers emails, URLs and phone numbers, but not names or system names. Next: add the named entities that matter here.
- Prompt leak detection only catches copied runs of 8 words, not paraphrases. Next: a canary token in the prompt.
- The input classifier:
  - sees only the newest message, so an attack split across several turns gets past it. Next: give it the last few turns as context.
  - adds 0.85 to 1.5 s per request. Next: run it in parallel with the first agent step.
  - fails open on errors. Next: alert on `classifier-error`, and fail closed once tools can act.
- Text streams first and is corrected afterwards, so an invented contact can be visible for up to one text block. Next: hold back only the pieces that look like a contact (digits, `@`, `http`).
- Every model is from OpenAI, so they can share blind spots. Next: a classifier or judge from another provider.

**Evals and prompt improvement**

- 25 eval cases catch regressions but give no statistical confidence. Next: grow the set from real questions.
- The judge is itself an LLM, so the hard requirements are deterministic checks. Next: calibrate it against a few answers graded by humans.
- The greeting fix was made by hand while I looked at both splits, so the holdout set is no longer fully blind. Next: a fresh holdout set that nobody tunes against.
- The improver rejects any drop in the holdout score, and makes one candidate per round. Next: a tolerance based on the measured run to run variance, and several candidates per round.
- CI runs the checks but not the evals, which need an API key. Next: a nightly job with the key as a repository secret.

**Chat page and API docs**

- Markdown shows as plain text, there are no component tests, and a network error needs a manual resend. Next: a Markdown renderer, Playwright tests, and one automatic retry.
- Swagger UI loads from a CDN, pinned and integrity checked. Next: serve it from the app.
- The stream events are described in prose in the OpenAPI spec. Next: a Zod schema per event, and AsyncAPI if the stream becomes a public contract.
