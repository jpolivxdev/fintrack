import { ApiError, FinishReason, FunctionCallingConfigMode, GoogleGenAI, type Content, type FunctionCall } from '@google/genai';
import {
  AiProviderError,
  type AiProvider,
  type AiTurn,
  type AiUsage,
  type StructuredRequest,
  type StructuredResponse,
  type ToolStepRequest,
  type ToolStepResponse,
} from './ai-provider.js';

/** Finish reasons that mean "no usable answer" (safety filters and friends). */
const BLOCKING_FINISH = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.LANGUAGE,
  FinishReason.OTHER,
]);

/**
 * Gemini API (Google AI Studio) through the official @google/genai SDK.
 * The key goes to the SDK constructor (sent as a header by the SDK, never put
 * in a URL by us) and is never logged; errors keep only the reason.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    const response = await this.call(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: request.data }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0,
          abortSignal: request.signal,
          httpOptions: { timeout: this.timeoutMs },
        },
      }),
    );
    this.assertUsable(response.promptFeedback?.blockReason, response.candidates?.[0]?.finishReason);
    const text = response.text;
    if (!text) throw new AiProviderError('blocked', 'empty response');
    try {
      return { value: JSON.parse(text), usage: usage(response.usageMetadata) };
    } catch {
      throw new AiProviderError('invalid_output', 'response is not JSON');
    }
  }

  async toolStep(request: ToolStepRequest): Promise<ToolStepResponse> {
    const response = await this.call(() =>
      this.client.models.generateContent({
        model: this.model,
        contents: request.turns.map(toContent),
        config: {
          systemInstruction: request.system,
          // No tools offered (budget spent): the model has to answer in text.
          ...(request.tools.length > 0 && {
            tools: [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
            // VALIDATED: text or calls that match the declared schemas, only to the declared functions.
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.VALIDATED, allowedFunctionNames: request.tools.map((t) => t.name) } },
          }),
          // The SDK must never run anything itself: our code executes the (validated) calls.
          automaticFunctionCalling: { disable: true },
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0,
          abortSignal: request.signal,
          httpOptions: { timeout: this.timeoutMs },
        },
      }),
    );
    this.assertUsable(response.promptFeedback?.blockReason, response.candidates?.[0]?.finishReason);
    const calls: FunctionCall[] = response.functionCalls ?? [];
    if (calls.length > 0) {
      return {
        kind: 'calls',
        calls: calls.map((c) => ({ name: c.name ?? '', args: c.args ?? {} })),
        // The model turn as returned (with thought signatures), to echo back as is.
        raw: response.candidates?.[0]?.content,
        usage: usage(response.usageMetadata),
      };
    }
    const text = response.text;
    if (!text) throw new AiProviderError('blocked', 'empty response');
    return { kind: 'text', text, usage: usage(response.usageMetadata) };
  }

  private assertUsable(blockReason: unknown, finishReason: unknown): void {
    if (blockReason) throw new AiProviderError('blocked', 'prompt blocked');
    if (typeof finishReason === 'string' && BLOCKING_FINISH.has(finishReason)) {
      throw new AiProviderError('blocked', `finish reason ${finishReason}`);
    }
  }

  /** Maps SDK/HTTP failures to reasons the gateway understands. Messages never carry the key. */
  private async call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw classify(error);
    }
  }
}

function usage(meta: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined): AiUsage {
  return { inputTokens: meta?.promptTokenCount ?? 0, outputTokens: meta?.candidatesTokenCount ?? 0 };
}

function toContent(turn: AiTurn): Content {
  if (turn.role === 'user') return { role: 'user', parts: [{ text: turn.text }] };
  if (turn.role === 'model') {
    if (turn.raw) return turn.raw as Content;
    return { role: 'model', parts: turn.calls.map((c) => ({ functionCall: { name: c.name, args: c.args as Record<string, unknown> } })) };
  }
  return {
    role: 'user',
    parts: turn.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.result } } })),
  };
}

/**
 * 429 RESOURCE_EXHAUSTED comes in flavors: per-minute (retry later), per-day
 * (wait for the reset) and "limit: 0" (no free quota for this model/project).
 * The distinction is read from the error details Google returns.
 */
export function classify(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || /timed? ?out|aborted/i.test(error.message))) {
    return new AiProviderError('timeout', 'request timed out');
  }
  if (error instanceof ApiError) {
    const details = error.message;
    if (error.status === 429) {
      if (/limit:\s*0\b|"quotaValue"\s*:\s*"0"/i.test(details)) return new AiProviderError('no_quota', 'no free quota for this model');
      if (/per ?day|PerDay|RPD/i.test(details)) return new AiProviderError('daily_quota', 'daily quota exhausted');
      return new AiProviderError('rate_limited', 'per-minute limit reached');
    }
    if (error.status === 401 || error.status === 403) return new AiProviderError('auth', `provider refused (${error.status})`);
    if (error.status === 400 && /FAILED_PRECONDITION|API key|location is not supported|billing/i.test(details)) {
      return new AiProviderError('auth', 'provider precondition failed');
    }
    if (error.status === 400) return new AiProviderError('invalid_output', 'provider rejected the request');
    if (error.status >= 500) return new AiProviderError('unavailable', `provider error ${error.status}`);
  }
  return new AiProviderError('unavailable', 'provider call failed');
}
