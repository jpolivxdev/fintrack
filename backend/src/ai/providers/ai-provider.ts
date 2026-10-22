/**
 * Provider-neutral contract for the AI features. The rest of the app never
 * imports a vendor SDK: swapping Gemini for another provider (or the fake one
 * used in tests) is a matter of implementing this interface.
 *
 * Everything a provider returns is untrusted: callers validate it with a
 * strict schema before using it.
 */

/** JSON Schema object, as accepted by the provider for constrained output. */
export type JsonSchema = Record<string, unknown>;

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface AiToolCall {
  name: string;
  /** Raw arguments from the model: validated by the caller before use. */
  args: unknown;
}

/**
 * One conversation turn. `raw` keeps the provider's own representation of a
 * model turn so it can be sent back unchanged (Gemini 3 requires the original
 * function-call parts, including thought signatures).
 */
export type AiTurn =
  | { role: 'user'; text: string }
  | { role: 'model'; calls: AiToolCall[]; raw?: unknown }
  | { role: 'tool'; results: Array<{ name: string; result: unknown }> };

export interface StructuredRequest {
  /** Rules for the model. Data never goes here. */
  system: string;
  /** Untrusted data, already serialized and delimited by the caller. */
  data: string;
  schema: JsonSchema;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface StructuredResponse {
  /** Parsed JSON (shape not guaranteed: validate it). */
  value: unknown;
  usage: AiUsage;
}

export interface ToolStepRequest {
  system: string;
  turns: AiTurn[];
  tools: AiToolDeclaration[];
  maxOutputTokens: number;
  signal: AbortSignal;
}

export type ToolStepResponse =
  | { kind: 'calls'; calls: AiToolCall[]; raw?: unknown; usage: AiUsage }
  | { kind: 'text'; text: string; usage: AiUsage };

/**
 * Why a call failed, from the app's point of view. The gateway decides what to
 * do with each one (retry once, open the circuit breaker, disable AI...).
 */
export type AiFailureReason =
  | 'rate_limited' // per-minute limit: retry once with backoff
  | 'daily_quota' // daily limit: don't retry until the quota resets
  | 'no_quota' // model has no free quota for this project: disable AI
  | 'auth' // invalid key / permission / precondition: disable AI
  | 'timeout'
  | 'blocked' // safety filter, empty or abnormal finish
  | 'invalid_output' // not the JSON we asked for
  | 'unavailable'; // network / 5xx

export class AiProviderError extends Error {
  constructor(
    readonly reason: AiFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiProvider {
  /** For logs and the settings screen, e.g. "gemini". */
  readonly name: string;
  readonly model: string;
  generateStructured(request: StructuredRequest): Promise<StructuredResponse>;
  toolStep(request: ToolStepRequest): Promise<ToolStepResponse>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
