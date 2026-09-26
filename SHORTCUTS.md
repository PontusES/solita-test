# Shortcuts

The 3 hour time cap was treated as the customer's budget. Work was prioritized so that whatever existed when time ran out was complete and working:

| Priority | Scope                                                                               | Status  |
| -------- | ----------------------------------------------------------------------------------- | ------- |
| P0       | Vector store, two tools, agent loop, JSON and SSE endpoints, unit tests, these docs | Built   |
| P1       | OpenAPI spec and Swagger UI, eval runner                                            | Built   |
| P2       | Prompt self-improver                                                                | Not yet |

Everything below is a deliberate shortcut: what was done, why it is acceptable for this case, and what would come next with more time.

## Storage and state

- **In-memory vector store with a linear scan.** Fine for 12 articles, where scoring every one takes microseconds. Next: pgvector, Azure AI Search or Qdrant with an approximate nearest neighbour index.
- **Embeddings are computed on the first request and lost on restart.** Twelve embeddings cost almost nothing, so recomputing is cheaper than building persistence. Next: embed once at ingest time and store the vectors with the documents.
- **State is per process.** Each server instance builds its own index, which works for one Node server but wastes work in serverless or multi-instance setups. Next: move the index into the shared vector database above.

## Security

- **No authentication.** An internal helpdesk would sit behind the company's SSO. Next: OIDC login, with the user's identity passed into tools and logs.
- **No rate limiting or cost limits.** Every request costs tokens. Next: per-user rate limits at the gateway or in middleware, and a token budget per user and day.

## Scope

- **Single turn only.** Each request is answered on its own; the user cannot ask a follow-up. The agent's internal message format already supports history. Next: a conversation id, a history store, and trimming of old turns.
- **No persisted conversations.** Nothing is saved after the response. Next: store conversations for support follow-up and for building eval cases from real traffic.

## Observability

- **Basic structured logging.** One JSON line per event with a request id, written with `console`. Next: pino for performance, and OpenTelemetry traces with spans for each model call and tool call, so latency and cost are visible per step.
- **Request ids are always generated.** An id arriving from a proxy (for example an incoming `x-request-id`) is not reused. Next: accept a trusted incoming id so traces connect across services.

## Data and content

- **Hardcoded escalation text.** The contact details are fictional constants in [getEscalationContact.ts](src/tools/getEscalationContact.ts). Next: read them from the on-call or service desk system, so they are always current.
- **A small hand-written knowledge base.** Twelve short articles in [articles.ts](src/knowledge/articles.ts), one embedding per article. Next: ingest the real wiki, split long pages into chunks, and re-index when pages change.
- **`KB_MIN_SCORE` is calibrated on very little data.** It was raised from 0.3 to 0.5 based on the eval runner: the correct article scored 0.55 to 0.70, unrelated articles 0.32 to 0.44. That rests on six correct matches, and a correct article phrased unusually could fall below 0.5; the agent then says the topic is not covered and offers escalation, which is the safe failure. Next: more eval cases before trusting any single threshold, and a reranker so the cut is less sensitive.

## Agent behaviour

- **Tools run one after another.** Parallel tool calls in the same step would be a little faster, but sequential runs are simpler to follow in the event stream. Next: run independent calls concurrently.
- **The final allowed step gets no answer.** If the model still calls tools on step `AGENT_MAX_STEPS`, those tools run, but the model gets no further turn, and the response ends with `finishReason: "max-steps"`. Next: on the last step, call the model once more with tools disabled to force a final answer.
- **No SSE heartbeat.** Runs take a few seconds, so idle proxies do not time out. Next: send a comment line every 15 seconds for long runs.

## Testing

- **Retrieval quality is measured only by the eval runner.** Unit tests use lexical fake embeddings so they never hit the network; that proves the wiring, not the quality of semantic matches. The eval runner checks it with real models, but it costs money, so it is run on demand rather than on every commit.
- **No CI pipeline.** The four checks run locally. Next: a GitHub Actions workflow running typecheck, lint, format check and tests on every push.
- **No end-to-end test against a deployed service.** Next: a small smoke suite against a staging deployment.

## Evals

- **A small eval set.** 13 cases (8 train, 5 holdout) is enough to catch regressions in the main behaviours, not to measure quality with statistical confidence. Next: grow it from real questions, with several paraphrases per intent.
- **One run per case by default.** The model is not deterministic: the first baseline run happened to pass "Good morning!", but 5 runs showed it failing 3 times out of 5. `--runs n` averages this out at n times the cost. Next: run 3 to 5 times before accepting any prompt change.
- **The judge is an LLM too.** Its scores vary and it can share blind spots with the agent, since both are OpenAI models. Hard requirements are therefore deterministic checks, and the judge only grades quality. Next: calibrate the judge on a handful of human graded answers, or use a judge from another provider.
- **Tool arguments are not checked.** A case checks that `get_escalation_contact` was called and that the exact critical text appears, which implies the severity, but it does not inspect arguments directly. Next: argument level expectations.

## Prompt

- **The greeting fix was made by hand, not by the improver.** The plan was to change the prompt only through the prompt self-improver (P2). The greeting failure was fixed earlier with a manual, general rule change, measured with 5 runs per case before and after and guarded by a new holdout case. Next: let the improver propose such changes, with the same measurement.
- **The holdout set has been seen.** The fix was designed while looking at the greeting results of both splits, so the holdout greeting is no longer a fully blind test. The new greeting plus question case was added after the fix for that reason. Next: keep a fresh holdout set that nobody tunes against.

## Not built yet

- **Prompt self-improver (P2).** Next: revise the prompt from failing train cases, and accept a candidate only if train improves and holdout does not get worse.

## API docs

- **Swagger UI is loaded from a CDN.** The version is pinned and the files are integrity checked, but `/docs` needs internet access. Next: serve `swagger-ui-dist` from the app itself.
- **Stream events are described in prose.** The OpenAPI spec lists the SSE event types and their fields in the description, but has no JSON Schema per event, because OpenAPI has no standard way to describe an event stream. Next: a Zod schema per event, shared with the TypeScript types, and an AsyncAPI document if the stream becomes a public contract.
- **The spec states that there is no authentication** (`security: []`), matching the code. It changes with the auth work above.

## Housekeeping

- The create-next-app landing page at `/` was kept as is; the product is the API.
