import { describe, expect, it } from 'vitest';
import { brDecimal, CSV_BOM, escapeCell, neutralizeFormula, toCsv } from './csv.js';

describe('csv', () => {
  it('neutralizes cells that spreadsheets would run as formulas', () => {
    expect(neutralizeFormula('=HYPERLINK("http://evil","clique")')).toBe('\'=HYPERLINK("http://evil","clique")');
    expect(neutralizeFormula('+5511999999999')).toBe("'+5511999999999");
    expect(neutralizeFormula('-2+3')).toBe("'-2+3");
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutralizeFormula('Mercado')).toBe('Mercado');
  });

  it('quotes separators, quotes and line breaks', () => {
    expect(escapeCell('Pão; leite')).toBe('"Pão; leite"');
    expect(escapeCell('Disse "oi"')).toBe('"Disse ""oi"""');
    expect(escapeCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(escapeCell('simples')).toBe('simples');
  });

  it('builds a BOM-prefixed, CRLF CSV and leaves numbers alone', () => {
    const csv = toCsv(['Descrição', 'Valor'], [
      [{ text: '=cmd|calc' }, { number: brDecimal('-1234.50') }],
      [{ text: 'Salário' }, { number: brDecimal('6500.00') }],
    ]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual(['Descrição;Valor', "'=cmd|calc;-1234,50", 'Salário;6500,00', '']);
  });
});
