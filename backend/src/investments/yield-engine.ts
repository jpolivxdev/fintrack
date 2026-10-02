/**
 * Investment value simulation. Pure: no database, no network, no clock.
 *
 * Each investment is replayed day by day from its first movement:
 *   1. the day's movements are added (contributions, withdrawals, income, fees);
 *   2. if the user recorded a valuation that day, it becomes the value
 *      (it is the closing value read on the broker/bank statement);
 *   3. otherwise, on business days, the value grows by the day's factor.
 *
 * Business days come from the CDI series itself (BCB only publishes the CDI on
 * business days, so weekends and holidays are skipped for free). After the last
 * published date, weekdays are assumed to be business days and the last known
 * rate is reused.
 */

export type YieldMode = 'CDI_PERCENT' | 'FIXED_RATE' | 'IPCA_PLUS' | 'MANUAL';

export interface Movement {
  /** YYYY-MM-DD */
  date: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  /**
   * External money (contributions/withdrawals) changes what was invested.
   * Internal money (dividends, interest paid, fees) is part of the return.
   */
  external: boolean;
}

export interface Valuation {
  date: string;
  value: number;
}

export interface MarketData {
  /** YYYY-MM-DD -> CDI in % per day. */
  cdi: ReadonlyMap<string, number>;
  /** YYYY-MM -> IPCA in % per month. */
  ipca: ReadonlyMap<string, number>;
}

export interface SimulationInput {
  mode: YieldMode;
  /** % of CDI (CDI_PERCENT) or % per year (FIXED_RATE, IPCA_PLUS). */
  rate: number | null;
  movements: readonly Movement[];
  valuations?: readonly Valuation[];
  market: MarketData;
  /** Last day simulated (inclusive), usually today. */
  until: string;
  /** Dates to report the value on (e.g. month ends). */
  checkpoints?: readonly string[];
}

export interface Point {
  date: string;
  value: number;
  invested: number;
}

export interface SimulationResult {
  value: number;
  invested: number;
  points: Point[];
  /** True when a rate the mode needs was missing and growth was skipped. */
  missingMarketData: boolean;
}

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function isWeekday(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Business-day calendar backed by the CDI series. */
export class BusinessCalendar {
  private readonly lastPublished: string | null;
  private readonly monthCount = new Map<string, number>();

  constructor(private readonly cdi: ReadonlyMap<string, number>) {
    let last: string | null = null;
    for (const date of cdi.keys()) if (!last || date > last) last = date;
    this.lastPublished = last;
  }

  isBusinessDay(date: string): boolean {
    if (this.cdi.has(date)) return true;
    // Inside the published range, a missing date is a weekend or a holiday.
    if (this.lastPublished && date <= this.lastPublished) return false;
    return isWeekday(date);
  }

  /** Business days in a YYYY-MM month (cached). */
  businessDaysInMonth(month: string): number {
    const cached = this.monthCount.get(month);
    if (cached !== undefined) return cached;
    let count = 0;
    for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) if (this.isBusinessDay(d)) count++;
    const result = Math.max(count, 1);
    this.monthCount.set(month, result);
    return result;
  }

  /** CDI for a business day: the published rate, or the last one known after the series ends. */
  cdiOn(date: string): number | null {
    const published = this.cdi.get(date);
    if (published !== undefined) return published;
    if (this.lastPublished && date > this.lastPublished) return this.cdi.get(this.lastPublished)!;
    return null;
  }
}

/** Last IPCA known up to a month (IPCA is published ~2 weeks after the month ends). */
function ipcaFor(ipca: ReadonlyMap<string, number>, month: string, sortedMonths: string[]): number | null {
  const exact = ipca.get(month);
  if (exact !== undefined) return exact;
  for (let i = sortedMonths.length - 1; i >= 0; i--) {
    if (sortedMonths[i] <= month) return ipca.get(sortedMonths[i])!;
  }
  return null;
}

export function simulate(input: SimulationInput): SimulationResult {
  const { mode, market, until } = input;
  const rate = input.rate ?? 0;
  const calendar = new BusinessCalendar(market.cdi);
  const ipcaMonths = [...market.ipca.keys()].sort();
  const fixedDaily = Math.pow(1 + rate / 100, 1 / 252);

  const movementsByDate = new Map<string, Movement[]>();
  for (const m of input.movements) {
    if (m.date > until) continue;
    const list = movementsByDate.get(m.date) ?? [];
    list.push(m);
    movementsByDate.set(m.date, list);
  }
  const valuationByDate = new Map((input.valuations ?? []).filter((v) => v.date <= until).map((v) => [v.date, v.value]));
  const checkpoints = [...new Set(input.checkpoints ?? [])].filter((c) => c <= until).sort();

  const starts = [...movementsByDate.keys(), ...valuationByDate.keys()].sort();
  const result: SimulationResult = { value: 0, invested: 0, points: [], missingMarketData: false };
  if (starts.length === 0) {
    result.points = checkpoints.map((date) => ({ date, value: 0, invested: 0 }));
    return result;
  }

  let value = 0;
  let invested = 0;
  let checkpointIndex = 0;
  // Checkpoints before the first movement are zero.
  while (checkpointIndex < checkpoints.length && checkpoints[checkpointIndex] < starts[0]) {
    result.points.push({ date: checkpoints[checkpointIndex++], value: 0, invested: 0 });
  }

  const factorOn = (date: string): number => {
    if (mode === 'MANUAL' || !calendar.isBusinessDay(date)) return 1;
    if (mode === 'FIXED_RATE') return fixedDaily;
    if (mode === 'CDI_PERCENT') {
      const cdi = calendar.cdiOn(date);
      if (cdi === null) {
        result.missingMarketData = true;
        return 1;
      }
      return 1 + (cdi / 100) * (rate / 100);
    }
    // IPCA_PLUS
    const month = date.slice(0, 7);
    const ipca = ipcaFor(market.ipca, month, ipcaMonths);
    if (ipca === null) result.missingMarketData = true;
    const inflationDaily = Math.pow(1 + (ipca ?? 0) / 100, 1 / calendar.businessDaysInMonth(month));
    return inflationDaily * fixedDaily;
  };

  for (let date = starts[0]; date <= until; date = addDays(date, 1)) {
    for (const m of movementsByDate.get(date) ?? []) {
      value += m.amount;
      if (m.external) invested += m.amount;
    }
    const valuation = valuationByDate.get(date);
    if (valuation !== undefined) value = valuation;
    else value *= factorOn(date);

    while (checkpointIndex < checkpoints.length && checkpoints[checkpointIndex] === date) {
      result.points.push({ date, value: round2(value), invested: round2(invested) });
      checkpointIndex++;
    }
  }

  result.value = round2(value);
  result.invested = round2(invested);
  return result;
}

/** Profit as a % of what was invested; null when nothing (net) is invested. */
export function profitPercent(value: number, invested: number): number | null {
  if (invested <= 0) return null;
  return round2(((value - invested) / invested) * 100);
}

/** "Rendeu X% do CDI": your profit relative to the same flows at 100% of the CDI. */
export function percentOfCdi(profit: number, cdiProfit: number): number | null {
  if (cdiProfit <= 0.005) return null;
  return round2((profit / cdiProfit) * 100);
}

/** Last day of each of the `months` months up to `today`'s month; the current month ends today. */
export function monthEnds(today: string, months: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const dates: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(Date.UTC(y, m - 1 - i + 1, 0)).toISOString().slice(0, 10);
    dates.push(end > today ? today : end);
  }
  return dates;
}
