# Shortcuts

The 3 hour time cap was treated as the customer's budget. Work was prioritized so that whatever existed at any point was complete and working, and each priority was only started once the one before it was done:

| Priority  | Scope                                                                                   | Status |
| --------- | --------------------------------------------------------------------------------------- | ------ |
| P0        | Vector store, two tools, agent loop, JSON and SSE endpoints, unit tests, these docs     | Built  |
| P1        | OpenAPI spec and Swagger UI, eval runner                                                | Built  |
| P2        | Prompt self-improver                                                                    | Built  |
| Extension | Guardrails and their joint prompt improvement, added after P2 at the customer's request | Built  |

The guardrails extension goes beyond the original 3 hour budget; it was a deliberate choice to add it, not scope creep hidden inside P0 to P2.

Everything below is a deliberate shortcut: what was done, why it is acceptable for this case, and what would come next with more time.

## Storage and state

- **In-memory vector store with a linear scan.** Fine for 12 articles, where scoring every one takes microseconds. Next: pgvector, Azure AI Search or Qdrant with an approximate nearest neighbour index.
- **Embeddings are computed on the first request and lost on restart.** Twelve embeddings cost almost nothing, so recomputing is cheaper than building persistence. Next: embed once at ingest time and store the vectors with the documents.
- **State is per process.** Each server instance builds its own index, which works for one Node server but wastes work in serverless or multi-instance setups. Next: move the index into the shared vector database above.

## Security

- **No authentication.** An internal helpdesk would sit behind the company's SSO. Next: OIDC login, with the user's identity passed into tools and logs.
- **No rate limiting or cost limits.** Every request costs tokens. Next: per-user rate limits at the gateway or in middleware, and a token budget per user and day.

## Scope

- **The client holds the conversation.** The server is stateless, so every request carries up to 20 earlier turns, and a long conversation costs more tokens per message and drops its oldest turns. The history is not signed, so a client can rewrite earlier assistant answers; that only affects its own session, and tool results are never accepted from clients. Next: server side conversations with an id, a store such as Redis or Postgres, and summarising old turns instead of dropping them.
- **No persisted conversations.** Nothing is saved on the server, and a reload of the chat page starts over. Next: store conversations for support follow up and for building eval cases from real traffic.

## Observability

- **Basic structured logging.** One JSON line per event with a request id, written with `console`. Next: pino for performance, and OpenTelemetry traces with spans for each model call and tool call, so latency and cost are visible per step.
- **Request ids are always generated.** An id arriving from a proxy (for example an incoming `x-request-id`) is not reused. Next: accept a trusted incoming id so traces connect across services.

## Data and content

- **Hardcoded escalation text.** The contact details are fictional constants in [getEscalationContact.ts](src/tools/getEscalationContact.ts). Next: read them from the on-call or service desk system, so they are always current.
- **A small hand-written knowledge base.** Twelve short articles in [articles.ts](src/knowledge/articles.ts), one embedding per article. Next: ingest the real wiki, split long pages into chunks, and re-index when pages change.
- **`KB_MIN_SCORE` is calibrated on very little data.** It was raised from 0.3 to 0.5 based on the eval runner: the correct article scored 0.55 to 0.70, unrelated articles 0.32 to 0.44. That rests on six correct matches, and a correct article phrased unusually could fall below 0.5; the agent then says the topic is not covered and offers escalation, which is the safe failure. The retrieval evals confirm the risk for raw user wording: ranking is good (recall@3 1.0), but relevant hits score as low as 0.349 against 0.303 for the strongest out of scope question, and 0.5 cuts 43% of them. The agent's rewritten queries score higher, which is why the answer evals pass. Next: retrieval cases built from the agent's actual queries, a threshold chosen from both sets, and a reranker so the cut is less sensitive.

## Agent behaviour

- **Tools run one after another.** Parallel tool calls in the same step would be a little faster, but sequential runs are simpler to follow in the event stream. Next: run independent calls concurrently.
- **The final allowed step gets no answer.** If the model still calls tools on step `AGENT_MAX_STEPS`, those tools run, but the model gets no further turn, and the response ends with `finishReason: "max-steps"`. Next: on the last step, call the model once more with tools disabled to force a final answer.
- **No SSE heartbeat.** Runs take a few seconds, so idle proxies do not time out. Next: send a comment line every 15 seconds for long runs.

## Testing

- **Retrieval quality is measured with real embeddings only on demand.** Unit tests use lexical fake embeddings so they never hit the network; that proves the wiring, not the quality of semantic matches. `npm run eval:retrieval` measures it with real embeddings in about a second, and the answer evals cover it end to end, but both need an API key and are run by hand.
- **CI runs the checks, not the evals.** The workflow runs typecheck, lint, format check, tests and a build, with no API key. Next: a scheduled job with the key as a repository secret, running the retrieval evals (almost free) on every push and the answer evals nightly, failing on a drop below the committed baseline.
- **No end-to-end test against a deployed service.** Next: a small smoke suite against a staging deployment.

## Evals

- **A small eval set.** 25 cases (14 train, 11 holdout, 9 of them for guardrails and 3 follow ups) is enough to catch regressions in the main behaviours, not to measure quality with statistical confidence. Next: grow it from real questions, with several paraphrases per intent.
- **One run per case by default.** The model is not deterministic: the first baseline run happened to pass "Good morning!", but 5 runs showed it failing 3 times out of 5. `--runs n` averages this out at n times the cost. Next: run 3 to 5 times before accepting any prompt change.
- **The judge is an LLM too.** Its scores vary and it can share blind spots with the agent, since both are OpenAI models. Hard requirements are therefore deterministic checks, and the judge only grades quality. Next: calibrate the judge on a handful of human graded answers, or use a judge from another provider.
- **Tool arguments are not checked.** A case checks that `get_escalation_contact` was called and that the exact critical text appears, which implies the severity, but it does not inspect arguments directly. Next: argument level expectations.

## Chat page

- **Answers are shown as plain text.** The model writes Markdown, so `**bold**` and list markers show as typed. Next: a Markdown renderer with HTML disabled, which is a new dependency.
- **No component tests.** The page's event handling is a pure function with unit tests, and the stream parser is shared with the route tests, but the React component itself was only checked by hand against the live server. Next: Playwright against `next start` with the fake container.
- **No retry on a network error.** A request that fails before any response (seen once through WSL's localhost forwarding) shows "Failed to fetch" and has to be sent again. Next: retry once automatically, which is safe because both tools only read.

## Guardrails

- **Secret detection is pattern based.** It catches the common shapes (a keyword like "password" followed by a value, well known key formats, card numbers that pass the Luhn check) and misses secrets with no recognisable shape, for example a bare password with no keyword. Next: a dedicated secret scanner or the company's DLP service.
- **Only emails, URLs and phone numbers are checked for grounding.** Bare domains, names and office locations are not. A different path on a known domain counts as invented, which is strict on purpose. Next: extend the check to named entities that matter here, such as system names.
- **Prompt leak detection only catches copies.** It looks for runs of 8 words copied from the system prompt. A paraphrased leak passes, and relies on the input classifier stopping "show me your instructions" first. Next: a canary token in the prompt, and an output classifier.
- **No output content classifier.** Nothing checks answers for harmful or off brand content beyond the rules above, because the agent only answers from IT articles. Next: a moderation model on the output, checked the same way.
- **The classifier sees only the newest message.** Earlier messages were checked when they were sent, but an attack split across several harmless looking turns would pass it; the output checks still apply. Next: give the classifier the last few turns as context.
- **The classifier adds latency.** It runs before the agent, adding 0.85 to 1.5 seconds per request in the live test. Next: start the first agent step in parallel and cancel it if the classifier blocks.
- **The classifier fails open.** On an error or timeout the request continues, visible as a `classifier-error` notice. This trades a window without injection detection for availability; the deterministic guardrails still apply. Next: alerting on the notice, and fail closed for higher risk tools if the agent ever gets tools that act.
- **Corrected text is visible until its block ends.** Output checks run on complete text blocks while the text streams, so an invented contact or a leaked sentence can be shown for up to one block (typically under a second) before the `text-replace` event swaps it out. The JSON endpoint and the model's history only ever hold the corrected text. Next: hold back just the pieces that look like a contact (digits, `@`, `http`) until the check has run, which keeps the streaming feel and closes most of the gap.
- **The refusals are fixed English texts.** Next: localised texts, and a way to report a wrong block.
- **One model family everywhere.** The agent, the classifier, the judge and the optimizer are all OpenAI models, so they may share blind spots. Next: a classifier or judge from another provider.

## Prompt

- **The greeting fix was made by hand, not by the improver.** The plan was to change the prompt only through the prompt self-improver. The greeting failure was fixed before the improver existed, with a manual, general rule change, measured with 5 runs per case before and after and guarded by a new holdout case. Next: route every prompt change through `npm run improve-prompt` or at least the same before and after measurement.
- **The holdout set has been seen.** The fix was designed while looking at the greeting results of both splits, so the holdout greeting is no longer a fully blind test. The new greeting plus question case was added after the fix for that reason. Next: keep a fresh holdout set that nobody tunes against.

## Prompt self-improver

- **"Holdout must not drop" has no tolerance.** Round 3 of the committed run was rejected for a holdout drop from 1.000 to 0.987, which over 3 runs may be noise. A strict rule errs on the side of keeping a known good prompt, which is the right default for an artifact that changes production behaviour. Next: more runs per evaluation, or a tolerance based on the measured run to run variance.
- **One candidate per round.** Each round asks for a single revision, so three rounds explore three ideas, and here all three were variations of the same one. Next: several candidates per round with different instructions, keeping the best that passes the acceptance rule.
- **Candidate reports are summaries.** The `.json` next to each candidate has split scores, the decision and the regressed case ids, but not each case's failed checks. Diagnosing a regression means rerunning `npm run eval -- --prompt` on the candidate. Next: store the per case results as well.
- **Small data, real cost.** One improver run with 22 cases is about 260 agent runs plus classifier, judge and optimizer calls, under $1 here, and still judged on a small case set. Next: a larger case set before letting the improver make decisions on its own.
- **Both prompts in one candidate.** The optimizer may change the agent prompt and the guardrail prompt together, so an accepted pair could hide a regression in one behind an improvement in the other. The per case regression rule limits this, and the `.json` records which prompts changed. Next: accept changes to each prompt separately when both change.

## API docs

- **Swagger UI is loaded from a CDN.** The version is pinned and the files are integrity checked, but `/docs` needs internet access. Next: serve `swagger-ui-dist` from the app itself.
- **Stream events are described in prose.** The OpenAPI spec lists the SSE event types and their fields in the description, but has no JSON Schema per event, because OpenAPI has no standard way to describe an event stream. Next: a Zod schema per event, shared with the TypeScript types, and an AsyncAPI document if the stream becomes a public contract.
- **The spec states that there is no authentication** (`security: []`), matching the code. It changes with the auth work above.

## Housekeeping

- The create-next-app landing page at `/` was kept as is; the product is the API.
