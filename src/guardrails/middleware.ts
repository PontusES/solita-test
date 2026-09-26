import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolResultOutput,
} from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";
import { removeUngroundedContacts } from "./contacts";
import { detectPromptLeak, PROMPT_LEAK_REFUSAL } from "./promptLeak";
import { redactSecrets } from "./secrets";
import type { GuardrailNotice } from "./types";

type Report = (notice: GuardrailNotice) => void;

// Streamed text that an output check changed: what was sent, and what it should have been.
export interface TextCorrection {
  original: string;
  corrected: string;
}
type Correct = (correction: TextCorrection) => void;

// Runs before every model call: secrets in user messages never reach the provider.
export function createSecretRedactionMiddleware(
  report: Report = () => {},
): LanguageModelMiddleware {
  return {
    transformParams: async ({ params }) => {
      let redactedAny = false;
      const prompt: LanguageModelV4Prompt = params.prompt.map((message) => {
        if (message.role !== "user") return message;
        return {
          ...message,
          content: message.content.map((part) => {
            if (part.type !== "text") return part;
            const { text, redacted } = redactSecrets(part.text);
            redactedAny ||= redacted;
            return { ...part, text };
          }),
        };
      });
      if (redactedAny) {
        report({ stage: "input", rule: "secret", action: "redacted" });
      }
      return { ...params, prompt };
    },
  };
}

function toolOutputText(output: LanguageModelV4ToolResultOutput): string {
  return "value" in output ? JSON.stringify(output.value) : "";
}

// What the model was allowed to know: tool results, what the user wrote, and its own answers
// from earlier turns, so a follow up may repeat a contact it was given before.
function groundingSources(prompt: LanguageModelV4Prompt): string[] {
  return prompt.flatMap((message) => {
    if (message.role === "user") {
      return message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
    }
    // Within a run, an assistant message is only added together with its tool calls, so a
    // text only assistant message is an earlier turn, not unchecked text from this run.
    if (message.role === "assistant" && message.content.every((part) => part.type === "text")) {
      return message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
    }
    if (message.role === "tool") {
      return message.content.flatMap((part) =>
        part.type === "tool-result" ? [toolOutputText(part.output)] : [],
      );
    }
    return [];
  });
}

function systemPromptOf(prompt: LanguageModelV4Prompt): string {
  return prompt
    .flatMap((message) => (message.role === "system" ? [message.content] : []))
    .join("\n");
}

// Output rails in streaming mode: text is passed on as it arrives, so the user sees the answer
// being written, and each text block is checked once it is complete. If a check changes the
// block, `correct` is called so the client can replace what it already showed. This is NeMo's
// stream_first=true: better perceived latency, at the cost that an invented contact or a
// leaked sentence can be visible until the block ends.
export function createOutputGuardMiddleware(
  report: Report = () => {},
  correct: Correct = () => {},
): LanguageModelMiddleware {
  return {
    wrapStream: async ({ doStream, params }) => {
      const { stream, ...rest } = await doStream();
      const systemPrompt = systemPromptOf(params.prompt);
      const sources = groundingSources(params.prompt);
      const buffers = new Map<string, string>();

      function checked(text: string): string {
        if (detectPromptLeak(text, systemPrompt)) {
          report({ stage: "output", rule: "prompt-leak", action: "replaced" });
          return PROMPT_LEAK_REFUSAL;
        }
        const { text: cleaned, removed } = removeUngroundedContacts(text, sources);
        if (removed.length > 0) {
          report({ stage: "output", rule: "ungrounded-contact", action: "removed" });
        }
        return cleaned;
      }

      const guarded = stream.pipeThrough(
        new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
          transform(part, controller) {
            if (part.type === "text-start") {
              buffers.set(part.id, "");
            } else if (part.type === "text-delta") {
              buffers.set(part.id, (buffers.get(part.id) ?? "") + part.delta);
            } else if (part.type === "text-end") {
              const text = buffers.get(part.id);
              buffers.delete(part.id);
              if (text) {
                const corrected = checked(text);
                if (corrected !== text) {
                  correct({ original: text, corrected });
                }
              }
            }
            controller.enqueue(part);
          },
        }),
      );
      return { stream: guarded, ...rest };
    },
  };
}
