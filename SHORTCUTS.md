# Shortcuts

The 3 hour time cap was treated as the customer's budget. Work was prioritized so that whatever existed when time ran out was complete and working:

| Priority | Scope                                                                               | Status                                         |
| -------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| P0       | Vector store, two tools, agent loop, JSON and SSE endpoints, unit tests, these docs | Built                                          |
| P1       | OpenAPI spec and Swagger UI, eval runner                                            | OpenAPI and Swagger built, eval runner not yet |
| P2       | Prompt self-improver                                                                | Not yet                                        |

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
- **`KB_MIN_SCORE` is not calibrated.** It is set to 0.3 as a starting point. A smoke test showed an irrelevant article passing at 0.32, while correct matches scored between 0.57 and 0.69. Next: set it from the eval runner's results.

## Agent behaviour

- **Tools run one after another.** Parallel tool calls in the same step would be a little faster, but sequential runs are simpler to follow in the event stream. Next: run independent calls concurrently.
- **The final allowed step gets no answer.** If the model still calls tools on step `AGENT_MAX_STEPS`, those tools run, but the model gets no further turn, and the response ends with `finishReason: "max-steps"`. Next: on the last step, call the model once more with tools disabled to force a final answer.
- **No SSE heartbeat.** Runs take a few seconds, so idle proxies do not time out. Next: send a comment line every 15 seconds for long runs.

## Testing

- **Retrieval quality is only checked manually.** Unit tests use lexical fake embeddings so they never hit the network; that proves the wiring, not the quality of semantic matches. Next: the eval runner (P1) measures it with real models.
- **No CI pipeline.** The four checks run locally. Next: a GitHub Actions workflow running typecheck, lint, format check and tests on every push.
- **No end-to-end test against a deployed service.** Next: a small smoke suite against a staging deployment.

## Prompt

- **The prompt makes the model search even for greetings.** Rule 1 says to search for any question, and the model applies that literally to "Hi!". It is not fixed by hand on purpose: changes to the prompt should be driven by the eval runner and the prompt improver, so they are measurably better and do not break other cases.

## Not built yet

- **Eval runner (P1).** Next: about 12 cases split into train and holdout, deterministic checks on tool usage and exact escalation text, plus an LLM judge with a rubric.
- **Prompt self-improver (P2).** Next: revise the prompt from failing train cases, and accept a candidate only if train improves and holdout does not get worse.

## API docs

- **Swagger UI is loaded from a CDN.** The version is pinned and the files are integrity checked, but `/docs` needs internet access. Next: serve `swagger-ui-dist` from the app itself.
- **Stream events are described in prose.** The OpenAPI spec lists the SSE event types and their fields in the description, but has no JSON Schema per event, because OpenAPI has no standard way to describe an event stream. Next: a Zod schema per event, shared with the TypeScript types, and an AsyncAPI document if the stream becomes a public contract.
- **The spec states that there is no authentication** (`security: []`), matching the code. It changes with the auth work above.

## Housekeeping

- The create-next-app landing page at `/` was kept as is; the product is the API.
