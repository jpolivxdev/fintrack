import { Prisma } from '../../generated/prisma/client.js';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

type MoneyInput = number | string | Decimal | null | undefined;

/** Converts a value to an exact Decimal (null/undefined become 0). */
export function toDecimal(value: MoneyInput): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value);
}

/** Serializes money as a fixed 2-decimal string, e.g. "1234.50". */
export function formatMoney(value: MoneyInput): string {
  return toDecimal(value).toFixed(2);
}

/** (part / whole) * 100 rounded to 2 decimals; 0 when whole is 0. */
export function percentage(part: Decimal, whole: Decimal): number {
  if (whole.isZero()) return 0;
  return part.div(whole).mul(100).toDecimalPlaces(2).toNumber();
}
