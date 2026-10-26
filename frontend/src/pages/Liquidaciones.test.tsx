import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Liquidaciones } from './Liquidaciones'
import { CLIENTES, LIQUIDACION, LIQUIDACION_ANULADA, LIQUIDACION_PAGADA } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/liquidaciones']}>
      <Routes>
        <Route path="/liquidaciones" element={<Liquidaciones />} />
        <Route path="/liquidaciones/nueva" element={<p>NUEVA LIQUIDACIÓN</p>} />
        <Route path="/liquidaciones/:id" element={<p>FICHA DE LA LIQUIDACIÓN</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base(lista: unknown = [LIQUIDACION, LIQUIDACION_PAGADA, LIQUIDACION_ANULADA]) {
  return servidor({ 'GET /api/liquidaciones': json(lista), 'GET /api/clientes': json(CLIENTES) })
}

afterEach(() => vi.unstubAllGlobals())

describe('Liquidaciones — el listado', () => {
  it('lista número, propietario, fechas dd-mm-aaaa, cobrado, comisión, neto y estado', async () => {
    const api = base()
    montar()

    expect(await screen.findByRole('link', { name: 'L-000001' })).toHaveAttribute('href', '/liquidaciones/60')
    expect(screen.getAllByText('Ana Inventada')).toHaveLength(3)
    expect(screen.getAllByText('15-11-2026').length).toBeGreaterThan(0)
    expect(screen.getAllByText('$ 270.000,00')).toHaveLength(3)
    expect(screen.getAllByText('$ 13.500,00')).toHaveLength(3)
    expect(screen.getAllByText('$ 205.500,00')).toHaveLength(3)
    expect(screen.getByText('Emitida')).toBeInTheDocument()
    expect(screen.getByText('Pagada')).toBeInTheDocument()
    expect(screen.getByText('Anulada')).toBeInTheDocument()
    expect(screen.getByText('3 liquidaciones')).toBeInTheDocument()
    expect(api.de('GET', '/api/liquidaciones')[0].query.get('limit')).toBe('500')
  })

  it('filtra por propietario y por estado en el servidor', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByRole('link', { name: 'L-000001' })

    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Filtrar por propietario' }), /Ana Inventada/)
    await waitFor(() => expect(api.de('GET', '/api/liquidaciones').at(-1)?.query.get('propietario_id')).toBe('1'))
    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Pagada' }))
    await waitFor(() => expect(api.de('GET', '/api/liquidaciones').at(-1)?.query.get('estado')).toBe('pagada'))
  })

  it('«Nueva liquidación» lleva a la pantalla de emitir, y una fila a su ficha', async () => {
    const user = userEvent.setup()
    base()
    const { unmount } = montar()
    await user.click(await screen.findByRole('button', { name: 'Nueva liquidación' }))
    expect(await screen.findByText('NUEVA LIQUIDACIÓN')).toBeInTheDocument()
    unmount()

    montar()
    await user.click((await screen.findAllByText('Ana Inventada'))[0])
    expect(await screen.findByText('FICHA DE LA LIQUIDACIÓN')).toBeInTheDocument()
  })

  it('sin liquidaciones lo dice; un error del servidor se ve arriba', async () => {
    base([])
    const { unmount } = montar()
    expect(await screen.findByText('Todavía no hay liquidaciones emitidas.')).toBeInTheDocument()
    unmount()
    servidor({ 'GET /api/liquidaciones': error(403, 'No tenés permiso para hacer esto.'), 'GET /api/clientes': json([]) })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })
})
