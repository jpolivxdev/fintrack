import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionForm } from './transaction-form'

const TRANSPORT = { id: '11111111-1111-4111-8111-111111111111', name: 'Transporte', type: 'EXPENSE', icon: 'car', color: '#eab308' }
const FOOD = { id: '22222222-2222-4222-8222-222222222222', name: 'Alimentação', type: 'EXPENSE', icon: 'utensils', color: '#ef4444' }
const ACCOUNT = { id: '33333333-3333-4333-8333-333333333333', name: 'Conta principal' }

const mutateAsync = vi.fn()
const suggestCategory = vi.fn()

vi.mock('@/hooks/queries', () => ({
  useCategories: () => ({ data: [TRANSPORT, FOOD] }),
  useSaveTransaction: () => ({ mutateAsync }),
}))
vi.mock('@/hooks/queries-more', () => ({ useAccounts: () => ({ data: { data: [ACCOUNT] } }) }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/queries-ai', () => ({ suggestCategory: (input: unknown) => suggestCategory(input) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('TransactionForm category suggestion', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({})
    suggestCategory.mockReset()
  })
  afterEach(cleanup)

  it('suggests a category after the description and fills it when accepted', async () => {
    suggestCategory.mockResolvedValue({ categoriaId: TRANSPORT.id, categoriaNome: 'Transporte', confianca: 0.82, origem: 'ia', iaDisponivel: true })
    const user = userEvent.setup()
    render(<TransactionForm initialType="EXPENSE" onDone={() => {}} />)

    await user.type(screen.getByLabelText('Descrição'), 'Corrida 99 aeroporto')
    await user.type(screen.getByLabelText('Valor (R$)'), '45,90')
    expect(suggestCategory).toHaveBeenCalledWith({ descricao: 'Corrida 99 aeroporto', tipo: 'EXPENSE', valor: undefined })

    const chip = await screen.findByRole('button', { name: /Usar.*Transporte.*pela IA · 82%/ })
    await user.click(chip)
    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0][0].input).toMatchObject({ description: 'Corrida 99 aeroporto', amount: 45.9, categoryId: TRANSPORT.id })
  })

  it('shows nothing without a suggestion, and the form still works by hand', async () => {
    suggestCategory.mockResolvedValue({ categoriaId: null, categoriaNome: null, confianca: 0, origem: 'nenhuma', iaDisponivel: false })
    const user = userEvent.setup()
    render(<TransactionForm initialType="EXPENSE" onDone={() => {}} />)
    await user.type(screen.getByLabelText('Descrição'), 'Coisa qualquer')
    await user.tab()
    await waitFor(() => expect(suggestCategory).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /^Usar/ })).toBeNull()
  })

  it('ignores a suggested id that is not one of the household categories', async () => {
    suggestCategory.mockResolvedValue({ categoriaId: '99999999-9999-4999-8999-999999999999', categoriaNome: '<img src=x onerror=alert(1)>', confianca: 0.99, origem: 'ia', iaDisponivel: true })
    const user = userEvent.setup()
    const { container } = render(<TransactionForm initialType="EXPENSE" onDone={() => {}} />)
    await user.type(screen.getByLabelText('Descrição'), 'Algo')
    await user.tab()
    await waitFor(() => expect(suggestCategory).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /^Usar/ })).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('does not ask when editing an existing transaction', async () => {
    const user = userEvent.setup()
    const editing = {
      id: 't1', description: 'Uber', amount: '20.00', type: 'EXPENSE', date: '2026-10-01', notes: null,
      category: TRANSPORT, account: ACCOUNT,
    } as never
    render(<TransactionForm editing={editing} initialType="EXPENSE" onDone={() => {}} />)
    await user.click(screen.getByLabelText('Descrição'))
    await user.tab()
    expect(suggestCategory).not.toHaveBeenCalled()
  })
})
