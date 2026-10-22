import {
  AiProviderError,
  type AiProvider,
  type StructuredRequest,
  type StructuredResponse,
  type ToolStepRequest,
  type ToolStepResponse,
} from './ai-provider.js';
import { fromData } from '../text.js';

type Scripted<T> = T | AiProviderError | ((request: never) => T | AiProviderError);

const USAGE = { inputTokens: 100, outputTokens: 20 };
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Deterministic provider for development and tests: no key, no network, no cost.
 *
 * By default it behaves like a reasonable model (picks the category whose name
 * appears in the description; answers questions with a month summary). Tests
 * can queue scripted answers to simulate a model that misbehaves, e.g. one
 * that "obeys" a prompt injection, returns invalid JSON, or fails.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly model = 'fake-deterministic';
  readonly structuredQueue: Array<Scripted<unknown>> = [];
  readonly toolQueue: Array<Scripted<ToolStepResponse>> = [];
  /** Every request received, so tests can assert what was (not) sent. */
  readonly requests: Array<StructuredRequest | ToolStepRequest> = [];

  reset(): void {
    this.structuredQueue.length = 0;
    this.toolQueue.length = 0;
    this.requests.length = 0;
  }

  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    this.requests.push(request);
    const next = this.structuredQueue.shift();
    if (next !== undefined) return { value: unwrap(next, request), usage: USAGE };
    // Default: the category whose name appears in the description.
    const data = fromData(request.data) as { descricao: string; categorias: string[] };
    const description = strip(data.descricao);
    const match = data.categorias.find((c) => description.includes(strip(c)));
    return { value: { categoria: match ?? data.categorias[0], confianca: match ? 0.82 : 0.35 }, usage: USAGE };
  }

  async toolStep(request: ToolStepRequest): Promise<ToolStepResponse> {
    this.requests.push(request);
    const next = this.toolQueue.shift();
    if (next !== undefined) return unwrap(next, request);
    // Default: summarize the current month, then answer with the numbers.
    const last = request.turns.at(-1);
    if (last?.role === 'tool') {
      return { kind: 'text', text: `Aqui está o que encontrei: ${JSON.stringify(last.results[0]?.result)}`, usage: USAGE };
    }
    const today = new Date().toISOString().slice(0, 10);
    return {
      kind: 'calls',
      calls: [{ name: 'resumoDoPeriodo', args: { inicio: `${today.slice(0, 7)}-01`, fim: today } }],
      usage: USAGE,
    };
  }
}

function unwrap<T>(item: Scripted<T>, request: unknown): T {
  const value = typeof item === 'function' ? (item as (r: unknown) => T | AiProviderError)(request) : item;
  if (value instanceof AiProviderError) throw value;
  return value;
}
