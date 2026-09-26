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

// What the model was allowed to know: tool results and what the user wrote.
function groundingSources(prompt: LanguageModelV4Prompt): string[] {
  return prompt.flatMap((message) => {
    if (message.role === "user") {
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

// Output rails in blocking mode: each text block is held back until it is complete, checked,
// and only then released. Tool calls still stream immediately; only the answer text waits.
// This follows the "check before showing" default of OpenAI Guardrails and NeMo's
// stream_first=false: invented contact details or a leaked prompt must never reach the user.
export function createOutputGuardMiddleware(report: Report = () => {}): LanguageModelMiddleware {
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
              return;
            } else if (part.type === "text-end") {
              const text = buffers.get(part.id);
              buffers.delete(part.id);
              if (text) {
                controller.enqueue({ type: "text-delta", id: part.id, delta: checked(text) });
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
