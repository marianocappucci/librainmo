import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Cuotas } from './Cuotas'
import { CONTRATO, CUOTA_ANULADA, CUOTA_COBRADA, CUOTA_CON_PAGOS_A_CUENTA, CUOTA_EN_DOLARES, CUOTA_PENDIENTE } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/cuotas']}>
      <Routes>
        <Route path="/cuotas" element={<Cuotas />} />
        <Route path="/cuotas/generar" element={<p>GENERAR LAS CUOTAS</p>} />
        <Route path="/cuotas/:id" element={<p>FICHA DE LA CUOTA</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const LISTA = [CUOTA_PENDIENTE, CUOTA_COBRADA, CUOTA_ANULADA]

function base(cuotas: unknown = LISTA) {
  return servidor({ 'GET /api/cuotas': json(cuotas), 'GET /api/contratos': json([CONTRATO]) })
}

afterEach(() => vi.unstubAllGlobals())

describe('Cuotas — la moneda', () => {
  it('🔴 cada cuota lleva la moneda de su contrato: una en dólares se ve con «US$» y las otras con «$»', async () => {
    base([CUOTA_PENDIENTE, CUOTA_EN_DOLARES])
    montar()

    expect(await screen.findByText('US$ 1.200,00')).toBeInTheDocument()
    expect(screen.getByText('$ 462.500,50')).toBeInTheDocument()
  })
})

describe('Cuotas — pagos a cuenta (ADR-010)', () => {
  it('🔴 una pendiente con pagos a cuenta dice cuánto le falta; una sin pagos, una cobrada y una anulada no dicen saldo', async () => {
    base([CUOTA_CON_PAGOS_A_CUENTA, { ...CUOTA_PENDIENTE, periodo_desde: '2026-12-01' }, CUOTA_COBRADA, CUOTA_ANULADA])
    montar()

    const conSaldo = (await screen.findByText('· saldo $ 162.500,50')).closest('tr') as HTMLElement
    expect(conSaldo).toHaveTextContent('Pendiente')
    // El total sigue siendo el de la cuota; el saldo es aparte.
    expect(conSaldo).toHaveTextContent('$ 462.500,50')
    expect(screen.getAllByText('$ 462.500,50')).toHaveLength(4)
    expect(screen.getAllByText(/· saldo/)).toHaveLength(1)
  })
})

describe('Cuotas — el listado', () => {
  it('lista el mes, el contrato, el inquilino, el vencimiento dd-mm-aaaa, el total en formato argentino y el estado', async () => {
    const api = base()
    montar()

    expect(await screen.findByRole('link', { name: 'noviembre 2026' })).toHaveAttribute('href', '/cuotas/30')
    expect(screen.getByRole('link', { name: 'octubre 2026' })).toHaveAttribute('href', '/cuotas/31')
    expect(screen.getAllByRole('link', { name: 'C-000005' })[0]).toHaveAttribute('href', '/contratos/5')
    expect(screen.getAllByText('Carla Ficticia')).toHaveLength(3)
    expect(screen.getAllByText('10-11-2026').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$ 462.500,50')).toHaveLength(3)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('Cobrada')).toBeInTheDocument()
    expect(screen.getByText('Anulada')).toBeInTheDocument()
    expect(screen.getByText('3 cuotas')).toBeInTheDocument()
    // Sin filtros: pide el tope de página y nada más.
    const pedido = api.de('GET', '/api/cuotas')[0]
    expect(pedido.query.get('limit')).toBe('500')
    for (const clave of ['estado', 'contrato_id', 'desde', 'hasta']) expect(pedido.query.has(clave), clave).toBe(false)
  })

  it('filtra por estado y por contrato en el servidor', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByRole('link', { name: 'noviembre 2026' })

    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Pendiente' }))
    await waitFor(() => expect(api.de('GET', '/api/cuotas').at(-1)?.query.get('estado')).toBe('pendiente'))

    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Filtrar por contrato' }), /C-000005/)
    await waitFor(() => expect(api.de('GET', '/api/cuotas').at(-1)?.query.get('contrato_id')).toBe('5'))
    expect(api.de('GET', '/api/cuotas').at(-1)?.query.get('estado')).toBe('pendiente')
  })

  it('🔴 el rango de meses va del primer día del «desde» al último del «hasta» (febrero de un año común termina el 28)', async () => {
    const api = base()
    montar()
    await screen.findByRole('link', { name: 'noviembre 2026' })

    fireEvent.change(screen.getByLabelText('Desde el mes'), { target: { value: '2026-01' } })
    fireEvent.change(screen.getByLabelText('Hasta el mes'), { target: { value: '2026-02' } })

    await waitFor(() => {
      const ultimo = api.de('GET', '/api/cuotas').at(-1)?.query
      expect([ultimo?.get('desde'), ultimo?.get('hasta')]).toEqual(['2026-01-01', '2026-02-28'])
    })
  })

  it('«Generar las cuotas del mes» lleva a la pantalla de generar, y una fila a la ficha', async () => {
    const user = userEvent.setup()
    base()
    const { unmount } = montar()
    await user.click(await screen.findByRole('button', { name: 'Generar las cuotas del mes' }))
    expect(await screen.findByText('GENERAR LAS CUOTAS')).toBeInTheDocument()
    unmount()

    montar()
    await user.click((await screen.findAllByText('Carla Ficticia'))[0])
    expect(await screen.findByText('FICHA DE LA CUOTA')).toBeInTheDocument()
  })

  it('sin cuotas, o sin coincidencias, lo dice distinto; un error del servidor se ve arriba', async () => {
    const user = userEvent.setup()
    base([])
    const { unmount } = montar()
    expect(await screen.findByText('Todavía no hay cuotas generadas.')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Cobrada' }))
    expect(await screen.findByText('Ninguna cuota coincide con los filtros.')).toBeInTheDocument()
    unmount()

    servidor({ 'GET /api/cuotas': error(403, 'No tenés permiso para hacer esto.'), 'GET /api/contratos': json([]) })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })
})
