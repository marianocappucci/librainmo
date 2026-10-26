import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Contratos } from './Contratos'
import { CONTRATO_BORRADOR, CONTRATO_RESCINDIDO, CONTRATO_VIGENTE, resumen } from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/contratos']}>
      <Routes>
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/contratos/nuevo" element={<p>ALTA DE CONTRATO</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const LISTA = [resumen(CONTRATO_VIGENTE), resumen(CONTRATO_BORRADOR), resumen(CONTRATO_RESCINDIDO)]

afterEach(() => vi.unstubAllGlobals())

describe('Contratos — el listado', () => {
  it('lista número, propiedad, inquilino, plazo, alquiler y estado, con fechas dd-mm-aaaa e importes en formato argentino', async () => {
    const api = servidor({ 'GET /api/contratos': json(LISTA) })
    montar()

    expect(await screen.findByRole('link', { name: 'C-000005' })).toHaveAttribute('href', '/contratos/5')
    expect(screen.getAllByText('Avenida Ficticia 456').length).toBe(3)
    expect(screen.getAllByText('Carla Ficticia').length).toBe(3)
    // Las fechas del contrato, sin pasar por `Date` (no se corren un día).
    expect(screen.getAllByText('01-03-2026 al 29-02-2028').length).toBe(3)
    // El importe vigente tal cual lo manda la API, con miles y coma.
    expect(screen.getAllByText('$ 450.000,00').length).toBe(3)
    expect(screen.getByText('Vigente')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Rescindido')).toBeInTheDocument()
    expect(screen.getByText('3 contratos')).toBeInTheDocument()
    expect(api.de('GET', '/api/contratos')[0].query.get('limit')).toBe('200')
  })

  it('un contrato en dólares lleva «US$»', async () => {
    servidor({ 'GET /api/contratos': json([{ ...resumen(CONTRATO_VIGENTE), moneda: 'USD', importe_vigente: '1200.50' }]) })
    montar()
    expect(await screen.findByText('US$ 1.200,50')).toBeInTheDocument()
  })

  it('buscar pide `?q=` y filtrar por estado pide `?estado=`', async () => {
    const user = userEvent.setup()
    const api = servidor({ 'GET /api/contratos': json(LISTA) })
    montar()
    await screen.findByRole('link', { name: 'C-000005' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'Ficticia')
    await waitFor(() => expect(api.de('GET', '/api/contratos').at(-1)?.query.get('q')).toBe('Ficticia'))

    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Vigente' }))
    await waitFor(() => expect(api.de('GET', '/api/contratos').at(-1)?.query.get('estado')).toBe('vigente'))
    expect(api.de('GET', '/api/contratos').at(-1)?.query.get('q')).toBe('Ficticia')
  })

  it('el filtro ofrece los cuatro estados del ciclo', async () => {
    const user = userEvent.setup()
    servidor({ 'GET /api/contratos': json([]) })
    montar()
    await user.click(await screen.findByRole('combobox', { name: 'Filtrar por estado' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Todos los estados', 'Borrador', 'Vigente', 'Rescindido', 'Finalizado',
    ])
  })

  it('«Nuevo contrato» lleva a la página del alta, y una fila a su ficha', async () => {
    const user = userEvent.setup()
    servidor({ 'GET /api/contratos': json(LISTA) })
    const { unmount } = montar()
    await user.click(await screen.findByRole('button', { name: 'Nuevo contrato' }))
    expect(await screen.findByText('ALTA DE CONTRATO')).toBeInTheDocument()
    unmount()

    montar()
    await user.click((await screen.findAllByText('Avenida Ficticia 456'))[0])
    expect(await screen.findByText('FICHA DEL CONTRATO')).toBeInTheDocument()
  })

  it('sin contratos lo dice, y un error del servidor se ve arriba', async () => {
    servidor({ 'GET /api/contratos': json([]) })
    const { unmount } = montar()
    expect(await screen.findByText('Todavía no hay contratos cargados.')).toBeInTheDocument()
    unmount()

    servidor({ 'GET /api/contratos': error(403, 'No tenés permiso para hacer esto.') })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })
})
