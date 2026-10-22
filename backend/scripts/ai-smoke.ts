/**
 * Manual smoke test against the REAL Gemini API: `npm run ai:smoke`.
 *
 * Local only (refuses to run in CI), with fictional data only, and makes at
 * most 3 requests, so it barely touches the free-tier quota. It checks that
 * the key, the model name and the two request shapes we use (structured
 * output and function calling) still work, e.g. after an SDK or model update.
 *
 * Needs GEMINI_API_KEY (and optionally GEMINI_MODEL) in backend/.env.
 * The key is never printed.
 */
import 'dotenv/config';
import { z } from 'zod';
import { TOOL_DECLARATIONS } from '../src/ai/ask/ask-tools.js';
import { AiProviderError } from '../src/ai/providers/ai-provider.js';
import { GeminiProvider } from '../src/ai/providers/gemini.provider.js';
import { asData } from '../src/ai/text.js';

if (process.env.CI) {
  console.error('ai:smoke calls the real Gemini API and never runs in CI.');
  process.exit(1);
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set GEMINI_API_KEY in backend/.env (Google AI Studio > Get API key). Do not enable billing.');
  process.exit(1);
}
const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
const provider = new GeminiProvider(apiKey, model, 15_000);
const signal = () => AbortSignal.timeout(15_000);

async function step(name: string, run: () => Promise<string>): Promise<boolean> {
  const started = Date.now();
  try {
    const detail = await run();
    console.log(`  ok    ${name} (${Date.now() - started} ms) ${detail}`);
    return true;
  } catch (error) {
    const reason = error instanceof AiProviderError ? error.reason : 'unexpected';
    console.log(`  FAIL  ${name} (${Date.now() - started} ms): ${reason}`);
    return false;
  }
}

console.log(`Gemini smoke test, model ${model}, fictional data\n`);

const categories = ['Alimentação', 'Transporte', 'Lazer', 'Moradia', 'Saúde'];
const results = [
  await step('structured output (categorize)', async () => {
    const response = await provider.generateStructured({
      system: 'Classifique a transação em uma das categorias. Responda só o JSON.',
      data: asData({ descricao: 'Corrida aplicativo aeroporto', tipo: 'despesa', valor: 58.9, categorias: categories }),
      schema: {
        type: 'object',
        properties: { categoria: { type: 'string', enum: categories }, confianca: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['categoria', 'confianca'],
        additionalProperties: false,
      },
      maxOutputTokens: 64,
      signal: signal(),
    });
    const parsed = z.object({ categoria: z.enum(categories), confianca: z.number().min(0).max(1) }).strict().parse(response.value);
    return `-> ${parsed.categoria} (${parsed.confianca}), tokens ${response.usage.inputTokens}/${response.usage.outputTokens}`;
  }),

  await step('function calling (ask)', async () => {
    const response = await provider.toolStep({
      system: `Hoje é ${new Date().toISOString().slice(0, 10)}. Use as ferramentas para responder.`,
      turns: [{ role: 'user', text: asData({ pergunta: 'Quanto gastei este mês?' }) }],
      tools: TOOL_DECLARATIONS,
      maxOutputTokens: 200,
      signal: signal(),
    });
    if (response.kind !== 'calls') throw new AiProviderError('invalid_output', 'expected a function call');
    return `-> ${response.calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(', ')}`;
  }),
];

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed. Limits for your project: AI Studio > "View your active rate limits".`);
process.exit(passed === results.length ? 0 : 1);
