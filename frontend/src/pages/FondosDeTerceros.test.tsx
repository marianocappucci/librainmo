import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FondosDeTerceros } from './FondosDeTerceros'
import { FONDOS } from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/fondos-de-terceros']}>
      <Routes>
        <Route path="/fondos-de-terceros" element={<FondosDeTerceros />} />
        <Route path="/liquidaciones/nueva" element={<p>NUEVA LIQUIDACIÓN</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Fondos de terceros', () => {
  it('🔴 muestra lo que se les debe a los propietarios y lo que deben los inquilinos, con los totales en formato argentino', async () => {
    servidor({ 'GET /api/reportes/fondos-de-terceros': json(FONDOS) })
    montar()

    expect(await screen.findByText('Se les debe a los propietarios')).toBeInTheDocument()
    expect(screen.getByText('Se les debe a los propietarios').closest('[data-slot="card"]')).toHaveTextContent('$ 341.500,00')
    expect(screen.getByText('Deben los inquilinos').closest('[data-slot="card"]')).toHaveTextContent('$ 462.500,50')

    const propietarios = screen.getByText('A pagar a propietarios').closest('[data-slot="card"]') as HTMLElement
    expect(within(propietarios).getByText('Ana Inventada').closest('tr')).toHaveTextContent('$ 205.500,00')
    expect(within(propietarios).getByText('Beto Ejemplo').closest('tr')).toHaveTextContent('$ 136.000,00')
    expect(within(propietarios).getByText('Total a pagar').closest('tr')).toHaveTextContent('$ 341.500,00')
    const inquilinos = screen.getByText('Inquilinos deudores').closest('[data-slot="card"]') as HTMLElement
    expect(within(inquilinos).getByText('Carla Ficticia').closest('tr')).toHaveTextContent('$ 462.500,50')
  })

  it('🔴 cada propietario enlaza a su liquidación nueva, con él ya elegido', async () => {
    servidor({ 'GET /api/reportes/fondos-de-terceros': json(FONDOS) })
    montar()
    expect(await screen.findByRole('link', { name: 'Liquidar a Ana Inventada' })).toHaveAttribute('href', '/liquidaciones/nueva?propietario=1')
    expect(screen.getByRole('link', { name: 'Liquidar a Beto Ejemplo' })).toHaveAttribute('href', '/liquidaciones/nueva?propietario=2')
  })

  it('sin saldos lo dice en cada lista', async () => {
    servidor({
      'GET /api/reportes/fondos-de-terceros': json({ a_pagar_a_propietarios: [], total_a_pagar: '0.00', inquilinos_deudores: [], total_adeudado: '0.00' }),
    })
    montar()
    expect(await screen.findByText('No se le debe nada a ningún propietario.')).toBeInTheDocument()
    expect(screen.getByText('Ningún inquilino debe nada.')).toBeInTheDocument()
  })

  it('un error del servidor se ve arriba', async () => {
    servidor({ 'GET /api/reportes/fondos-de-terceros': error(403, 'No tenés permiso para hacer esto.') })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })
})
