# IT Helpdesk Agent

A small agent-driven backend: an internal IT helpdesk assistant for employees. It answers troubleshooting questions from a knowledge base found by semantic search, and hands out the official escalation contact when a problem is urgent or unresolved.

Design principle: **RAG for fuzzy knowledge, deterministic tools for exact and authoritative answers.**

## Quick start

Requires Node 22 or newer (developed on Node 24).

```bash
npm install
cp .env.example .env.local   # then set OPENAI_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable                 | Default                  | Purpose                                                  |
| ------------------------ | ------------------------ | -------------------------------------------------------- |
| `OPENAI_API_KEY`         | none, required           | Read on the first agent request, not at build time       |
| `OPENAI_CHAT_MODEL`      | `gpt-6-luna`             | Chat model                                               |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model for the knowledge base                   |
| `AGENT_MAX_STEPS`        | `5`                      | Maximum model calls per request                          |
| `TOOL_TIMEOUT_MS`        | `10000`                  | Per tool call                                            |
| `KB_TOP_K`               | `3`                      | Default number of articles returned by a search          |
| `KB_MIN_SCORE`           | `0.3`                    | Minimum cosine similarity for a hit (not calibrated yet) |

## Try it

```bash
curl localhost:3000/api/health

curl -X POST localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"I cannot reach the work network from home"}'

# Same JSON, easy to open in a browser
curl "localhost:3000/api/agent/ask?q=my+laptop+is+really+slow"

# Server-Sent Events: -N turns off curl's buffering so events show up as they arrive
curl -N -X POST localhost:3000/api/agent/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"The mail server is down for the whole office"}'
```

Example response from `/api/agent/chat` (from a real run, shortened: article contents, the query and the lower ranked hits). The user said "work network from home"; the article is called "VPN and remote access troubleshooting", which is the kind of match embeddings are here for:

```json
{
  "answer": "Internal systems are reachable from home through the corporate VPN. Try these steps from **“VPN and remote access troubleshooting”**: ...",
  "toolCalls": [
    {
      "name": "search_knowledge_base",
      "args": {
        "query": "Connect to the work network remotely from home VPN troubleshooting",
        "topK": 5
      },
      "result": {
        "results": [
          {
            "id": "kb-vpn-remote-access",
            "title": "VPN and remote access troubleshooting",
            "content": "...",
            "score": 0.689
          },
          {
            "id": "kb-office-wifi",
            "title": "Wireless network in the office",
            "content": "...",
            "score": 0.417
          }
        ]
      },
      "isError": false
    }
  ],
  "finishReason": "stop",
  "usage": { "inputTokens": 1546, "outputTokens": 156, "totalTokens": 1702 }
}
```

The stream sends one SSE event per agent event:

```text
event: tool-call
data: {"type":"tool-call","id":"call_VHID...","name":"search_knowledge_base","args":{"query":"mail server down outage affecting whole office","topK":5}}

event: tool-result
data: {"type":"tool-result","id":"call_VHID...","name":"search_knowledge_base","result":{"results":[...]},"isError":false}

event: text-delta
data: {"type":"text-delta","text":" off"}

event: done
data: {"type":"done","finishReason":"stop","usage":{"inputTokens":2223,"outputTokens":175,"totalTokens":2398}}
```

Swagger UI at `/docs` is planned (P1), see [SHORTCUTS.md](SHORTCUTS.md).

## API

| Method | Path                     | Input                                    | Response                                                                                   |
| ------ | ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/api/agent/chat`        | `{ "message": string }`, 1 to 2000 chars | `200 { answer, toolCalls, finishReason, usage }`                                           |
| POST   | `/api/agent/chat/stream` | same                                     | `200 text/event-stream`, events: `tool-call`, `tool-result`, `text-delta`, `done`, `error` |
| GET    | `/api/agent/ask?q=`      | query parameter, same rules              | same JSON as `/chat`                                                                       |
| GET    | `/api/health`            |                                          | `{ "status": "ok" }`, works without an API key                                             |

Successful and failed agent responses (200 and 500) carry an `x-request-id` header that matches the server log.

**Errors.** Bodies use the `application/problem+json` format (RFC 9457).

- `400`: invalid JSON or validation failure, with `errors: [{ path, message }]`.
- `500`: a generic `{ code: "agent_failed", detail, requestId }`. Internal details are only written to the server log, under the same request id.
- Streaming: input and setup are checked before the stream starts, so they still get real status codes. Once streaming, the status is already 200, so a failure is sent as a final `error` event with the same `code`, message and `requestId`, and the stream closes.

## Architecture

```text
 src/app/api/*/route.ts     Next.js route handlers: parse input, map results to HTTP
          │
 src/http/                  request parsing, JSON and SSE transports, problem responses
          │
 src/container.ts           reads config once, wires real implementations (tests swap in fakes)
          │
 src/agent/runAgent.ts      the agent loop: an async generator of AgentEvents
     │              │
 LlmClient      ToolRegistry
 (agent/llm/)   (tools/)
     │              ├── search_knowledge_base ── VectorStore + EmbeddingProvider (knowledge/)
 OpenAI via         └── get_escalation_contact  (hardcoded authoritative text)
 the AI SDK
```

Next.js is only the HTTP layer. `agent/`, `tools/` and `knowledge/` are plain TypeScript with injected dependencies and no framework imports, so they could move to Fastify or a Lambda unchanged. Only [openAiClient.ts](src/agent/llm/openAiClient.ts) and [embeddings.ts](src/knowledge/embeddings.ts) import the AI SDK.

## Design decisions

**Own agent loop instead of the SDK's built-in one.** The AI SDK can run tools and loop itself (`stopWhen`). We pass tools to it without `execute`, so each call is exactly one model step, and [runAgent.ts](src/agent/runAgent.ts) does the rest. This gives full control over the event format, error handling and step limit, and a provider independent seam (`LlmClient`) that tests replace with a scripted fake. The loop is also the part this case is about, so it should be visible code, not configuration.

**RAG for fuzzy knowledge, deterministic tools for exact answers.** Employees describe problems in their own words ("can't reach the work network from home"), while articles use other wording ("VPN and remote access troubleshooting"). That is where embeddings help. Escalation contacts are the opposite: they are authoritative and must be reproduced exactly, so they come from a function, never from retrieval. The same reasoning applies to the assignment's example strings ("It's warmer in France than Sweden"): the vector store tests use them, but in a real system comparative facts like these belong in structured data where a comparison is exact.

**One generator, two transports.** `runAgent` yields events. [collect.ts](src/agent/collect.ts) folds them into the JSON response; [sse.ts](src/http/sse.ts) forwards them as Server-Sent Events. There is one agent implementation behind both.

**Failures are results, not crashes.** An unknown tool, invalid arguments (checked with the tool's Zod schema), a thrown error or a timeout all become an `isError: true` result that goes back to the model, which can then correct itself or explain the problem. The tool timeout races the tool against a timer, so even a tool that ignores its abort signal cannot hang a request.

**Cancellation reaches OpenAI.** The request's `AbortSignal` is passed through the loop into the model call, so a client that disconnects stops generation and billing.

**Node runtime, lazy container.** Every route exports `runtime = "nodejs"`, because the knowledge index lives in process memory. The container is built on the first request, not at import time, so `next build` works without an API key. Articles are embedded once and the in-flight promise is cached, so concurrent first requests share one indexing run.

**Models.** `gpt-6-luna` is OpenAI's most efficient current model. It is a reasoning model, and on the Chat Completions API it only supports function calling with reasoning turned off, so we call it with `reasoning: "none"`. Chat Completions is stateless, so our own message history maps onto it directly; a helpdesk lookup does not need reasoning, and this keeps latency and cost low. Embeddings use `text-embedding-3-small`, which is plenty for a small article set.

**Error handling.** Following the OWASP guidance, clients get a generic message and a request id; the full error goes to the structured JSON log under that id. User messages are not logged, only their length.

## Testing

```bash
npm test               # 83 tests, no network
npm run typecheck      # next typegen && tsc --noEmit
npm run lint
npm run format:check
```

Tests never call OpenAI:

- The agent loop runs against `FakeLlmClient`, which replays scripted model steps and records what the model would have seen.
- Knowledge search uses `FakeEmbeddingProvider`, a deterministic hashed bag of words. It only matches shared words, so it is a test double, never a production option.
- The OpenAI adapters are tested against the AI SDK's `MockLanguageModelV4` and a stubbed `fetch`.
- Route handlers are called directly with a `Request`, with the container swapped for fakes.

Coverage by area: vector math and ranking; both tools and their input validation; every loop path (plain answer, search, both tools, tool error, unknown tool, invalid args, timeout, step limit, abort); JSON and SSE transports including error sanitizing; and every route handler: 200 and 400, plus 500 for `/chat` and `/chat/stream`.

## Evals and prompt improvement

Planned as P1 (eval runner) and P2 (prompt self-improver), see [SHORTCUTS.md](SHORTCUTS.md). Manual smoke tests with real models already show why they matter: an irrelevant article passed the `KB_MIN_SCORE` threshold at 0.32, and the model searched the knowledge base even for a plain "Hi!".

## Versions

Next.js 16.3.6, AI SDK `ai` 7.0.116 with `@ai-sdk/openai` 4.0.78, Zod 4.6.5, Vitest 5.0.2, TypeScript 5.9 (strict). All direct dependencies added for this project are pinned exactly.

## How AI tools were used

This project was built with Claude Code, working phase by phase from a written spec. For every phase I reviewed and approved the plan before any code was written, then reviewed the result before it was committed. Library and model APIs (AI SDK v7, current OpenAI models) were checked against current documentation and the installed type definitions rather than taken from memory. Every commit was gated by typecheck, lint and the test suite, plus manual smoke tests against the real API. I am responsible for every line and can explain it.
