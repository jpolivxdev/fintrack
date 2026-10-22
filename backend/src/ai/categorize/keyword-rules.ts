import { normalizeForMatch } from '../text.js';

/**
 * Fallback (and first try) without AI: common Brazilian merchants and words
 * mapped to the default category names. A rule only applies when the household
 * actually has a category with that name.
 */
const RULES: Array<{ type: 'EXPENSE' | 'INCOME'; category: string; words: string[] }> = [
  { type: 'EXPENSE', category: 'Alimentação', words: ['ifood', 'rappi', 'mercado', 'supermercado', 'padaria', 'restaurante', 'lanchonete', 'lanche', 'pizza', 'hamburguer', 'burger', 'acougue', 'hortifruti', 'feira', 'cafe', 'mcdonald', 'outback'] },
  { type: 'EXPENSE', category: 'Transporte', words: ['uber', 'taxi', 'onibus', 'metro', 'combustivel', 'gasolina', 'etanol', 'posto', 'estacionamento', 'pedagio', 'bilhete unico'] },
  { type: 'EXPENSE', category: 'Assinaturas', words: ['netflix', 'spotify', 'prime video', 'amazon prime', 'disney', 'hbo', 'max', 'youtube premium', 'icloud', 'google one', 'deezer', 'globoplay', 'chatgpt'] },
  { type: 'EXPENSE', category: 'Moradia', words: ['aluguel', 'condominio', 'iptu', 'conta de luz', 'energia', 'enel', 'sabesp', 'conta de agua', 'gas', 'internet', 'vivo fibra', 'claro net'] },
  { type: 'EXPENSE', category: 'Saúde', words: ['farmacia', 'drogaria', 'drogasil', 'raia', 'remedio', 'consulta', 'medico', 'dentista', 'exame', 'plano de saude', 'unimed', 'academia'] },
  { type: 'EXPENSE', category: 'Educação', words: ['curso', 'faculdade', 'mensalidade escolar', 'escola', 'livro', 'udemy', 'alura', 'material escolar'] },
  { type: 'EXPENSE', category: 'Lazer', words: ['cinema', 'ingresso', 'show', 'bar', 'balada', 'steam', 'playstation', 'xbox', 'parque'] },
  { type: 'INCOME', category: 'Salário', words: ['salario', 'holerite', 'pagamento empresa', 'folha de pagamento'] },
  { type: 'INCOME', category: 'Freelance', words: ['freela', 'freelance', 'projeto cliente'] },
  { type: 'INCOME', category: 'Investimentos', words: ['rendimento', 'dividendo', 'juros', 'jcp', 'resgate cdb'] },
];

export const RULE_CONFIDENCE = 0.9;

/** Name of the default category the description points to, or null. */
export function ruleCategory(type: 'EXPENSE' | 'INCOME', description: string): string | null {
  // Whole words only ("max" must not match "maximo"); punctuation separates words ("IFOOD*SP").
  const text = ` ${normalizeForMatch(description).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const rule of RULES) {
    if (rule.type !== type) continue;
    if (rule.words.some((w) => text.includes(` ${w.trim()} `))) return rule.category;
  }
  return null;
}
