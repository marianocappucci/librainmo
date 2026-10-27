import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FondosDeTerceros } from './FondosDeTerceros'
import { FONDOS, FONDOS_EN_DOS_MONEDAS } from '@/test/datos'
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
    expect(within(propietarios).getByText('Total a pagar en pesos').closest('tr')).toHaveTextContent('$ 341.500,00')
    const inquilinos = screen.getByText('Inquilinos deudores').closest('[data-slot="card"]') as HTMLElement
    expect(within(inquilinos).getByText('Carla Ficticia').closest('tr')).toHaveTextContent('$ 462.500,50')
  })

  it('🔴 con pesos y dólares muestra dos totales, uno por moneda, y la moneda de cada fila; nunca los suma', async () => {
    servidor({ 'GET /api/reportes/fondos-de-terceros': json(FONDOS_EN_DOS_MONEDAS) })
    montar()
    await screen.findByText('Se les debe a los propietarios')

    const deben = screen.getByText('Se les debe a los propietarios').closest('[data-slot="card"]') as HTMLElement
    expect(within(deben).getByTestId('a-pagar-ARS')).toHaveTextContent('$ 341.500,00')
    expect(within(deben).getByTestId('a-pagar-USD')).toHaveTextContent('US$ 1.800,50')
    const adeudan = screen.getByText('Deben los inquilinos').closest('[data-slot="card"]') as HTMLElement
    expect(within(adeudan).getByTestId('adeudado-ARS')).toHaveTextContent('$ 462.500,50')
    expect(within(adeudan).getByTestId('adeudado-USD')).toHaveTextContent('US$ 1.200,00')

    const propietarios = screen.getByText('A pagar a propietarios').closest('[data-slot="card"]') as HTMLElement
    const filasDeAna = within(propietarios).getAllByText('Ana Inventada').map((e) => e.closest('tr'))
    expect(filasDeAna).toHaveLength(2)
    expect(filasDeAna[0]).toHaveTextContent('$ 205.500,00')
    expect(filasDeAna[1]).toHaveTextContent('US$ 1.800,50')
    expect(within(propietarios).getByText('Total a pagar en pesos').closest('tr')).toHaveTextContent('$ 341.500,00')
    expect(within(propietarios).getByText('Total a pagar en dólares').closest('tr')).toHaveTextContent('US$ 1.800,50')
    const inquilinos = screen.getByText('Inquilinos deudores').closest('[data-slot="card"]') as HTMLElement
    expect(within(inquilinos).getByText('Total adeudado en dólares').closest('tr')).toHaveTextContent('US$ 1.200,00')
  })

  it('🔴 Ana, con saldo en las dos monedas, tiene un enlace para liquidarle cada una (con la moneda en el enlace)', async () => {
    servidor({ 'GET /api/reportes/fondos-de-terceros': json(FONDOS_EN_DOS_MONEDAS) })
    montar()
    expect(await screen.findByRole('link', { name: 'Liquidar a Ana Inventada en pesos' })).toHaveAttribute('href', '/liquidaciones/nueva?propietario=1&moneda=ARS')
    expect(screen.getByRole('link', { name: 'Liquidar a Ana Inventada en dólares' })).toHaveAttribute('href', '/liquidaciones/nueva?propietario=1&moneda=USD')
  })

  it('🔴 cada propietario enlaza a su liquidación nueva, con él ya elegido', async () => {
    servidor({ 'GET /api/reportes/fondos-de-terceros': json(FONDOS) })
    montar()
    expect(await screen.findByRole('link', { name: 'Liquidar a Ana Inventada en pesos' })).toHaveAttribute(
      'href',
      '/liquidaciones/nueva?propietario=1&moneda=ARS',
    )
    expect(screen.getByRole('link', { name: 'Liquidar a Beto Ejemplo en pesos' })).toHaveAttribute('href', '/liquidaciones/nueva?propietario=2&moneda=ARS')
  })

  it('sin saldos lo dice en cada lista', async () => {
    servidor({
      'GET /api/reportes/fondos-de-terceros': json({ a_pagar_a_propietarios: [], inquilinos_deudores: [], totales: [{ moneda: 'ARS', a_pagar: '0.00', adeudado: '0.00' }] }),
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
