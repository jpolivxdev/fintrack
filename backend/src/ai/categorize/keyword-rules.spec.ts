import { describe, expect, it } from 'vitest';
import { cacheKey, normalizeForMatch } from '../text.js';
import { ruleCategory } from './keyword-rules.js';

describe('ruleCategory', () => {
  it.each([
    ['UBER *TRIP 4821', 'EXPENSE', 'Transporte'],
    ['IFOOD*RESTAURANTE', 'EXPENSE', 'Alimentação'],
    ['Farmácia São João', 'EXPENSE', 'Saúde'],
    ['Netflix.com', 'EXPENSE', 'Assinaturas'],
    ['Conta de luz Enel', 'EXPENSE', 'Moradia'],
    ['Salário outubro', 'INCOME', 'Salário'],
    ['Dividendos ITSA4', 'INCOME', null], // "dividendos" is not the word "dividendo"
    ['Dividendo ITSA4', 'INCOME', 'Investimentos'],
  ] as const)('%s (%s) -> %s', (description, type, expected) => {
    expect(ruleCategory(type, description)).toBe(expected);
  });

  it('matches whole words only', () => {
    expect(ruleCategory('EXPENSE', 'Máximo Atacadista')).toBeNull(); // not "max"
    expect(ruleCategory('EXPENSE', 'Barbearia do Zé')).toBeNull(); // not "bar"
    expect(ruleCategory('EXPENSE', 'Bar do Zé')).toBe('Lazer');
  });

  it('respects the transaction type', () => {
    expect(ruleCategory('INCOME', 'Uber')).toBeNull();
    expect(ruleCategory('EXPENSE', 'Salário')).toBeNull();
  });
});

describe('normalizeForMatch / cacheKey', () => {
  it('ignores case, accents, digits and spacing', () => {
    expect(normalizeForMatch('  UBER *Trip   4821 ')).toBe('uber *trip');
    expect(cacheKey('EXPENSE', 'Padaria Pão 01')).toBe(cacheKey('EXPENSE', 'padaria pao 99'));
  });

  it('keeps types apart', () => {
    expect(cacheKey('EXPENSE', 'Pix João')).not.toBe(cacheKey('INCOME', 'Pix João'));
  });
});
