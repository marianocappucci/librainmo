import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Cobros } from './Cobros'
import { COBRO, COBRO_ANULADO, CONTRATO } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/cobros']}>
      <Routes>
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/cobros/:id" element={<p>FICHA DEL COBRO</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base(lista: unknown = [COBRO]) {
  return servidor({ 'GET /api/cobros': json(lista), 'GET /api/contratos': json([CONTRATO]) })
}

afterEach(() => vi.unstubAllGlobals())

describe('Cobros — el listado', () => {
  it('lista fecha, contrato, inquilino, cuota, total con su punitorio, recibo y estado', async () => {
    const api = base()
    montar()

    expect(await screen.findByRole('link', { name: '14-11-2026' })).toHaveAttribute('href', '/cobros/40')
    expect(screen.getByRole('link', { name: 'C-000005' })).toHaveAttribute('href', '/contratos/5')
    expect(screen.getByText('Carla Ficticia')).toBeInTheDocument()
    expect(screen.getByText('noviembre 2026')).toBeInTheDocument()
    expect(screen.getByText('$ 471.750,51')).toBeInTheDocument()
    expect(screen.getByText('incluye $ 9.250,01 de punitorio')).toBeInTheDocument()
    expect(screen.getByText('N° 00000012')).toBeInTheDocument()
    expect(screen.getByText('Cobrado')).toBeInTheDocument()
    expect(screen.getByText('1 cobro')).toBeInTheDocument()
    // Por defecto, sin los anulados.
    expect(api.de('GET', '/api/cobros')[0].query.has('incluir_anulados')).toBe(false)
  })

  it('un cobro sin punitorio no lo aclara', async () => {
    base([{ ...COBRO, punitorio: '0.00', total: '462500.50', dias_de_atraso: 0 }])
    montar()
    expect(await screen.findByText('$ 462.500,50')).toBeInTheDocument()
    expect(screen.queryByText(/de punitorio/)).not.toBeInTheDocument()
  })

  it('🔴 «incluir los anulados» los pide al servidor y los muestra marcados', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByText('Cobrado')

    api.responder('GET /api/cobros', json([COBRO, COBRO_ANULADO]))
    await user.click(screen.getByRole('checkbox', { name: 'Incluir los anulados' }))
    await waitFor(() => expect(api.de('GET', '/api/cobros').at(-1)?.query.get('incluir_anulados')).toBe('true'))
    expect(await screen.findByText('Anulado')).toBeInTheDocument()
  })

  it('filtra por contrato y por fechas en el servidor', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByText('Cobrado')

    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Filtrar por contrato' }), /C-000005/)
    await waitFor(() => expect(api.de('GET', '/api/cobros').at(-1)?.query.get('contrato_id')).toBe('5'))
    fireEvent.change(screen.getByLabelText('Cobrados desde'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Cobrados hasta'), { target: { value: '2026-11-30' } })
    await waitFor(() => {
      const q = api.de('GET', '/api/cobros').at(-1)?.query
      expect([q?.get('contrato_id'), q?.get('desde'), q?.get('hasta')]).toEqual(['5', '2026-11-01', '2026-11-30'])
    })
  })

  it('una fila lleva a la ficha; sin cobros lo dice; un error del servidor se ve arriba', async () => {
    const user = userEvent.setup()
    base()
    const { unmount } = montar()
    await user.click(await screen.findByText('Carla Ficticia'))
    expect(await screen.findByText('FICHA DEL COBRO')).toBeInTheDocument()
    unmount()

    base([])
    const { unmount: otra } = montar()
    expect(await screen.findByText('Todavía no hay cobros registrados.')).toBeInTheDocument()
    otra()

    servidor({ 'GET /api/cobros': error(403, 'No tenés permiso para hacer esto.'), 'GET /api/contratos': json([]) })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })
})
