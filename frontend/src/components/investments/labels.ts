import type { Investment, InvestmentClass, YieldMode } from '@/lib/types'

export const CLASS_LABEL: Record<InvestmentClass, string> = {
  FIXED_INCOME: 'Renda fixa',
  TREASURY: 'Tesouro Direto',
  STOCKS: 'Ações',
  REITS: 'Fundos imobiliários',
  FUNDS: 'Fundos',
  CRYPTO: 'Cripto',
  PENSION: 'Previdência',
  OTHER: 'Outros',
}

/** Distinct, theme-friendly colors for the allocation chart. */
export const CLASS_COLOR: Record<InvestmentClass, string> = {
  FIXED_INCOME: '#8b5cf6',
  TREASURY: '#3b82f6',
  STOCKS: '#22c55e',
  REITS: '#f97316',
  FUNDS: '#06b6d4',
  CRYPTO: '#eab308',
  PENSION: '#ec4899',
  OTHER: '#64748b',
}

export const MODE_LABEL: Record<YieldMode, string> = {
  CDI_PERCENT: '% do CDI',
  FIXED_RATE: 'Prefixado',
  IPCA_PLUS: 'IPCA +',
  MANUAL: 'Valor de mercado',
}

/** Suggested mode when the class is picked (the user can still change it). */
export const DEFAULT_MODE: Record<InvestmentClass, YieldMode> = {
  FIXED_INCOME: 'CDI_PERCENT',
  TREASURY: 'CDI_PERCENT',
  STOCKS: 'MANUAL',
  REITS: 'MANUAL',
  FUNDS: 'MANUAL',
  CRYPTO: 'MANUAL',
  PENSION: 'MANUAL',
  OTHER: 'MANUAL',
}

const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** "110% do CDI", "Prefixado 12% a.a.", "IPCA + 6% a.a.", "Valor de mercado". */
export function describeYield(i: Pick<Investment, 'yieldMode' | 'rate'>): string {
  const rate = i.rate === null ? null : num.format(Number(i.rate))
  switch (i.yieldMode) {
    case 'CDI_PERCENT':
      return `${rate}% do CDI`
    case 'FIXED_RATE':
      return `Prefixado ${rate}% a.a.`
    case 'IPCA_PLUS':
      return `IPCA + ${rate}% a.a.`
    case 'MANUAL':
      return 'Valor de mercado'
  }
}
