import { Inject, Injectable, Logger } from '@nestjs/common';
import { addDays } from './yield-engine.js';
import type { MarketData } from './yield-engine.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Decimal } from '../common/utils/money.js';

export type Series = 'CDI' | 'IPCA';

export interface RatePoint {
  /** YYYY-MM-DD (IPCA: first day of the month). */
  date: string;
  rate: number;
}

/** Where public rates come from. Swappable in tests (no network in CI). */
export interface MarketRatesProvider {
  fetch(series: Series, from: string, to: string): Promise<RatePoint[]>;
}
export const MARKET_RATES_PROVIDER = Symbol('MARKET_RATES_PROVIDER');

/** Banco Central's SGS series: 12 = CDI (% a.d.), 433 = IPCA (% a.m.). */
const SGS_CODE: Record<Series, number> = { CDI: 12, IPCA: 433 };
/** Sanity bounds: anything outside is a parsing problem, not a real rate. */
const BOUNDS: Record<Series, [number, number]> = { CDI: [-1, 1], IPCA: [-10, 10] };
/** BCB refuses daily-series windows longer than 10 years. */
const MAX_WINDOW_DAYS = 3600;

const toBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fromBr = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;

@Injectable()
export class BcbRatesProvider implements MarketRatesProvider {
  async fetch(series: Series, from: string, to: string): Promise<RatePoint[]> {
    const points: RatePoint[] = [];
    for (let start = from; start <= to; start = addDays(start, MAX_WINDOW_DAYS + 1)) {
      const end = [addDays(start, MAX_WINDOW_DAYS), to].sort()[0];
      // Fixed host and path; only validated dates go into the query string.
      const url =
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SGS_CODE[series]}/dados` +
        `?formato=json&dataInicial=${toBr(start)}&dataFinal=${toBr(end)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
      // 404 = no data in the window (e.g. IPCA for the current month).
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`BCB ${series} responded ${response.status}`);
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new Error(`BCB ${series}: unexpected payload`);
      for (const row of body) {
        if (typeof row?.data !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(row.data)) continue;
        const rate = Number(row.valor);
        const [min, max] = BOUNDS[series];
        if (Number.isFinite(rate) && rate >= min && rate <= max) points.push({ date: fromBr(row.data), rate });
      }
    }
    return points;
  }
}

/** How far back rates are kept. Older investments start growing from here. */
const HISTORY_YEARS = 10;
/** Don't hit BCB again for a series more often than this (success or failure). */
const REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

export interface MarketStatus {
  cdiUpdatedAt: string | null;
  ipcaUpdatedAt: string | null;
}

/**
 * CDI and IPCA cached in Postgres. Requests read from the cache; the cache is
 * topped up from Banco Central at most every few hours, and a BCB outage only
 * means slightly older rates (never a failed request).
 */
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly nextTail = new Map<Series, number>();
  private readonly failedUntil = new Map<Series, number>();
  private readonly headTried = new Set<string>();
  private readonly inFlight = new Map<Series, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKET_RATES_PROVIDER) private readonly provider: MarketRatesProvider,
  ) {}

  /** Rates from `from` (clamped to the kept history) up to today. */
  async load(from: string, today: string): Promise<{ market: MarketData; status: MarketStatus }> {
    const floor = `${Number(today.slice(0, 4)) - HISTORY_YEARS}${today.slice(4)}`;
    const start = from < floor ? floor : from;
    await Promise.all((['CDI', 'IPCA'] as const).map((s) => this.ensure(s, start, today)));

    const rows = await this.prisma.marketRate.findMany({
      // IPCA is dated on the 1st: include the month `start` falls in.
      where: { date: { gte: new Date(`${start.slice(0, 7)}-01T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    });
    const cdi = new Map<string, number>();
    const ipca = new Map<string, number>();
    let cdiUpdatedAt: string | null = null;
    let ipcaUpdatedAt: string | null = null;
    for (const row of rows) {
      const date = row.date.toISOString().slice(0, 10);
      if (row.series === 'CDI') {
        cdi.set(date, row.rate.toNumber());
        cdiUpdatedAt = date;
      } else {
        ipca.set(date.slice(0, 7), row.rate.toNumber());
        ipcaUpdatedAt = date.slice(0, 7);
      }
    }
    return { market: { cdi, ipca }, status: { cdiUpdatedAt, ipcaUpdatedAt } };
  }

  private ensure(series: Series, from: string, today: string): Promise<void> {
    if (Date.now() < (this.failedUntil.get(series) ?? 0)) return Promise.resolve();
    // One refresh per series at a time, shared by concurrent requests.
    const running = this.inFlight.get(series);
    if (running) return running;
    const task = this.refresh(series, from, today).finally(() => this.inFlight.delete(series));
    this.inFlight.set(series, task);
    return task;
  }

  private async refresh(series: Series, from: string, today: string): Promise<void> {
    try {
      const range = await this.prisma.marketRate.aggregate({ where: { series }, _min: { date: true }, _max: { date: true } });
      const min = range._min.date?.toISOString().slice(0, 10);
      const max = range._max.date?.toISOString().slice(0, 10);
      const windows: [string, string][] = [];
      const tailDue = Date.now() >= (this.nextTail.get(series) ?? 0);
      const headKey = `${series}:${series === 'IPCA' ? `${from.slice(0, 7)}-01` : from}`;
      if (!min || !max) windows.push([from, today]);
      else {
        // History older than the cache is fetched right away (new old investment)...
        const head = series === 'IPCA' ? `${from.slice(0, 7)}-01` : from;
        if (head < min && !this.headTried.has(headKey)) windows.push([head, addDays(min, -1)]);
        // ...while recent days are topped up only every few hours.
        if (max < today && tailDue) windows.push([addDays(max, 1), today]);
      }
      for (const [start, end] of windows) {
        const points = await this.provider.fetch(series, start, end);
        if (points.length) {
          await this.prisma.marketRate.createMany({
            data: points.map((p) => ({ series, date: new Date(`${p.date}T00:00:00Z`), rate: new Decimal(p.rate) })),
            skipDuplicates: true,
          });
        }
      }
      // BCB may simply have nothing older: once fetched, don't ask again for the same date.
      this.headTried.add(headKey);
      if (tailDue) this.nextTail.set(series, Date.now() + REFRESH_MS);
    } catch (error) {
      // Serve what is cached; try again a bit later.
      this.logger.warn(`Could not refresh ${series} from Banco Central: ${error instanceof Error ? error.message : String(error)}`);
      this.failedUntil.set(series, Date.now() + RETRY_AFTER_FAILURE_MS);
    }
  }
}
