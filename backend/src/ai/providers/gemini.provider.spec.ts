import { ApiError, FinishReason } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderError } from './ai-provider.js';

const generateContent = vi.fn();
const constructed: unknown[] = [];

// Only the client is mocked: no network, ever. Errors and enums are the real ones.
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class GoogleGenAI {
    models = { generateContent };
    constructor(options: unknown) {
      constructed.push(options);
    }
  }
  return { ...actual, GoogleGenAI };
});

const { GeminiProvider, classify } = await import('./gemini.provider.js');

const KEY = 'fake-gemini-key-for-unit-tests';
const signal = new AbortController().signal;
const usageMetadata = { promptTokenCount: 120, candidatesTokenCount: 8 };

const apiError = (status: number, message: string) => new ApiError({ status, message });

describe('classify (Gemini errors to gateway reasons)', () => {
  it.each([
    [apiError(429, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}]}}'), 'rate_limited'],
    [apiError(429, 'Quota exceeded for metric: generate_content_free_tier_requests, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier'), 'daily_quota'],
    [apiError(429, 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-x'), 'no_quota'],
    [apiError(429, '{"quotaValue": "0"}'), 'no_quota'],
    [apiError(401, 'API key not valid'), 'auth'],
    [apiError(403, 'PERMISSION_DENIED'), 'auth'],
    [apiError(400, 'FAILED_PRECONDITION: User location is not supported for the API use.'), 'auth'],
    [apiError(400, 'API key expired. Please renew the API key.'), 'auth'],
    [apiError(400, 'Invalid JSON payload'), 'invalid_output'],
    [apiError(500, 'internal'), 'unavailable'],
    [apiError(503, 'overloaded'), 'unavailable'],
    [Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }), 'timeout'],
    [new Error('Request timed out'), 'timeout'],
    [new TypeError('fetch failed'), 'unavailable'],
    ['weird', 'unavailable'],
  ])('%s -> %s', (error, reason) => {
    expect(classify(error).reason).toBe(reason);
  });

  it('never carries the original message (which could echo request data)', () => {
    const error = classify(apiError(400, `bad request for key=${KEY}`));
    expect(error.message).not.toContain(KEY);
  });
});

describe('GeminiProvider', () => {
  beforeEach(() => {
    generateContent.mockReset();
    constructed.length = 0;
  });

  const provider = () => new GeminiProvider(KEY, 'gemini-3.5-flash-lite', 5000);

  it('passes the key to the SDK constructor only, never in the request', async () => {
    generateContent.mockResolvedValue({ text: '{"categoria":"Lazer","confianca":0.8}', candidates: [{ finishReason: FinishReason.STOP }], usageMetadata });
    await provider().generateStructured({ system: 's', data: 'd', schema: {}, maxOutputTokens: 64, signal });
    expect(constructed).toEqual([{ apiKey: KEY }]);
    expect(JSON.stringify(generateContent.mock.calls)).not.toContain(KEY);
  });

  it('structured output: JSON mode, schema, temperature 0, timeout and abort signal', async () => {
    generateContent.mockResolvedValue({ text: '{"categoria":"Lazer","confianca":0.8}', candidates: [{ finishReason: FinishReason.STOP }], usageMetadata });
    const schema = { type: 'object' };
    const result = await provider().generateStructured({ system: 'sys', data: '<dados>{}</dados>', schema, maxOutputTokens: 64, signal });
    expect(result).toEqual({ value: { categoria: 'Lazer', confianca: 0.8 }, usage: { inputTokens: 120, outputTokens: 8 } });
    const request = generateContent.mock.calls[0][0];
    expect(request).toMatchObject({
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: '<dados>{}</dados>' }] }],
      config: { systemInstruction: 'sys', responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 64, temperature: 0, httpOptions: { timeout: 5000 } },
    });
    expect(request.config.abortSignal).toBe(signal);
  });

  it.each([
    ['a blocked prompt', { promptFeedback: { blockReason: 'SAFETY' }, text: '{}' }, 'blocked'],
    ['a safety finish', { candidates: [{ finishReason: FinishReason.SAFETY }], text: '{}' }, 'blocked'],
    ['an empty answer', { candidates: [{ finishReason: FinishReason.STOP }], text: '' }, 'blocked'],
    ['text that is not JSON', { candidates: [{ finishReason: FinishReason.STOP }], text: 'Claro! A categoria é Lazer' }, 'invalid_output'],
  ])('rejects %s', async (_label, response, reason) => {
    generateContent.mockResolvedValue(response);
    await expect(provider().generateStructured({ system: 's', data: 'd', schema: {}, maxOutputTokens: 64, signal })).rejects.toMatchObject({ reason });
  });

  it('maps SDK errors through classify', async () => {
    generateContent.mockRejectedValue(apiError(429, 'limit: 0'));
    await expect(provider().generateStructured({ system: 's', data: 'd', schema: {}, maxOutputTokens: 64, signal })).rejects.toBeInstanceOf(AiProviderError);
  });

  it('tool step: declared functions only, VALIDATED mode, no automatic calling', async () => {
    const raw = { role: 'model', parts: [{ functionCall: { name: 'resumoDoPeriodo', args: { inicio: '2026-10-01', fim: '2026-10-22' } }, thoughtSignature: 'sig' }] };
    generateContent.mockResolvedValue({ functionCalls: [{ name: 'resumoDoPeriodo', args: { inicio: '2026-10-01', fim: '2026-10-22' } }], candidates: [{ content: raw, finishReason: FinishReason.STOP }], usageMetadata });
    const tools = [{ name: 'resumoDoPeriodo', description: 'd', parameters: { type: 'object' } }];
    const step = await provider().toolStep({ system: 's', turns: [{ role: 'user', text: 'q' }], tools, maxOutputTokens: 400, signal });
    expect(step).toEqual({ kind: 'calls', calls: [{ name: 'resumoDoPeriodo', args: { inicio: '2026-10-01', fim: '2026-10-22' } }], raw, usage: { inputTokens: 120, outputTokens: 8 } });
    const { config } = generateContent.mock.calls[0][0];
    expect(config.tools).toEqual([{ functionDeclarations: [{ name: 'resumoDoPeriodo', description: 'd', parametersJsonSchema: { type: 'object' } }] }]);
    expect(config.toolConfig).toEqual({ functionCallingConfig: { mode: 'VALIDATED', allowedFunctionNames: ['resumoDoPeriodo'] } });
    expect(config.automaticFunctionCalling).toEqual({ disable: true });
  });

  it('tool step without tools offers none, and echoes the raw model turn back', async () => {
    generateContent.mockResolvedValue({ text: 'Você gastou R$ 10,00.', candidates: [{ finishReason: FinishReason.STOP }], usageMetadata });
    const raw = { role: 'model', parts: [{ functionCall: { name: 'x', args: {} }, thoughtSignature: 'sig' }] };
    const step = await provider().toolStep({
      system: 's',
      turns: [
        { role: 'user', text: 'q' },
        { role: 'model', calls: [{ name: 'x', args: {} }], raw },
        { role: 'tool', results: [{ name: 'x', result: { total: '10.00' } }] },
      ],
      tools: [],
      maxOutputTokens: 400,
      signal,
    });
    expect(step).toMatchObject({ kind: 'text', text: 'Você gastou R$ 10,00.' });
    const { config, contents } = generateContent.mock.calls[0][0];
    expect(config.tools).toBeUndefined();
    expect(contents[1]).toBe(raw);
    expect(contents[2]).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'x', response: { result: { total: '10.00' } } } }] });
  });
});
