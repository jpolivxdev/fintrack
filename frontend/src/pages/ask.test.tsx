import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskPage } from './ask'

const status = { servidorDisponivel: true, aiEnabled: true, demo: false, provedor: 'fake', modelo: 'fake', cotaDiaria: 30, usadasHoje: 2 }
const mutateAsync = vi.fn()
let currentStatus: typeof status = status

vi.mock('@/hooks/queries-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/queries-ai')>()
  return {
    ...actual,
    useAiStatus: () => ({ data: currentStatus, isLoading: false }),
    useAsk: () => ({ mutateAsync, isPending: false }),
  }
})

const renderPage = () => render(<MemoryRouter><AskPage /></MemoryRouter>)

describe('AskPage', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    currentStatus = status
  })
  afterEach(cleanup)

  it('renders the model answer and the data as plain text, never as HTML', async () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)> Você gastou R$ 250,00.'
    mutateAsync.mockResolvedValue({
      resposta: evil,
      ferramentasUsadas: [{ nome: 'maioresDespesas', argumentos: {} }],
      dadosUtilizados: [{ ferramenta: 'maioresDespesas', resultado: { despesas: [{ descricao: '<b>Mercado</b>', valor: '250.00', data: '2026-10-05' }] } }],
    })
    const user = userEvent.setup()
    const { container } = renderPage()

    await user.type(screen.getByLabelText('Sua pergunta'), 'Quais minhas maiores despesas?')
    await user.click(screen.getByRole('button', { name: 'Perguntar' }))

    const answer = await screen.findByTestId('ai-answer')
    expect(answer.textContent).toBe(evil)
    await user.click(screen.getByText(/Dados usados \(/))
    expect(screen.getByText('<b>Mercado</b>')).toBeTruthy()
    expect(container.querySelector('script, img, b')).toBeNull()
    // Money from the tool comes formatted by the app, not by the model.
    expect(container.querySelector('dd .tabular')?.textContent).toMatch(/R\$\s250,00/)
  })

  it('explains limits in plain words', async () => {
    mutateAsync.mockRejectedValue(
      new AxiosError('429', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 429, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { motivo: 'user_quota' },
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Quanto gastei este mês?' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/todas as perguntas de hoje/)
  })

  it('without opt-in, points to Configurações and offers no input', () => {
    currentStatus = { ...status, aiEnabled: false }
    renderPage()
    expect(screen.getByRole('link', { name: 'Ir para Configurações' }).getAttribute('href')).toBe('/configuracoes')
    expect(screen.queryByLabelText('Sua pergunta')).toBeNull()
  })
})
