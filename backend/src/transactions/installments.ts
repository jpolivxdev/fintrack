import { Decimal } from '../common/utils/money.js';

export interface Installment {
  number: number;
  total: number;
  amount: Decimal;
  /** YYYY-MM-DD */
  date: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Splits a purchase into monthly installments, like a Brazilian credit card.
 * - Works in integer cents, so the parts always add up to the exact total:
 *   R$ 100,00 in 3x = 33,34 + 33,33 + 33,33 (leftover cents go first).
 * - One installment per month on the same day; a purchase on the 31st falls
 *   on the last day of shorter months (Feb 28/29, Apr 30...).
 */
export function buildInstallments(total: Decimal, count: number, firstDate: string): Installment[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const cents = total.mul(100).toNumber();
  if (!Number.isInteger(cents)) throw new Error('total must have at most 2 decimals');

  const base = Math.floor(cents / count);
  const leftover = cents - base * count;
  const [year, month, day] = firstDate.split('-').map(Number);

  return Array.from({ length: count }, (_, i) => {
    const target = new Date(Date.UTC(year, month - 1 + i, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    const d = Math.min(day, lastDay);
    return {
      number: i + 1,
      total: count,
      amount: new Decimal(base + (i < leftover ? 1 : 0)).div(100),
      date: `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(d)}`,
    };
  });
}
