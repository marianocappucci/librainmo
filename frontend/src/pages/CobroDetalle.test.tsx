import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CobroDetalle } from './CobroDetalle'
import { COBRO, COBRO_ANULADO, COBRO_A_CUENTA, COBRO_EN_DOLARES } from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'
import type { Cobro } from '@/lib/api'

function montar(cobro: Cobro) {
  return render(
    <MemoryRouter initialEntries={[`/cobros/${cobro.id}`]}>
      <Routes>
        <Route path="/cobros/:id" element={<CobroDetalle />} />
        <Route path="/cobros" element={<p>LISTA DE COBROS</p>} />
        <Route path="/cuotas/:id" element={<p>FICHA DE LA CUOTA</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const servirCobro = (cobro: Cobro) => servidor({ [`GET /api/cobros/${cobro.id}`]: json(cobro) })

afterEach(() => vi.unstubAllGlobals())

describe('Cobro — la moneda', () => {
  it('🔴 un cobro en dólares muestra con «US$» la cuota, el punitorio, el total, los medios y el reparto entre propietarios', async () => {
    servirCobro(COBRO_EN_DOLARES)
    montar(COBRO_EN_DOLARES)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })

    const d = within(screen.getByText('Datos del cobro').closest('[data-slot="card"]') as HTMLElement)
    expect(d.getByText('Importe de la cuota').nextSibling).toHaveTextContent('US$ 462.500,50')
    expect(d.getByText('Total cobrado').nextSibling).toHaveTextContent('US$ 471.750,51')
    // Ni un solo importe de la pantalla queda en pesos.
    expect(screen.queryByText(/(^|[^S])\$ \d/)).not.toBeInTheDocument()
    expect(screen.getByText('Ana Inventada').closest('tr')).toHaveTextContent('US$')
  })
})

describe('Cobro — los datos', () => {
  it('muestra el cobro con fechas dd-mm-aaaa, importes en formato argentino, el punitorio con sus días de atraso y el recibo', async () => {
    servirCobro(COBRO)
    montar(COBRO)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })

    const datos = screen.getByText('Datos del cobro').closest('[data-slot="card"]') as HTMLElement
    const d = within(datos)
    expect(d.getByRole('link', { name: 'C-000005' })).toHaveAttribute('href', '/contratos/5')
    expect(d.getByRole('link', { name: 'noviembre 2026' })).toHaveAttribute('href', '/cuotas/30')
    expect(d.getByText('Importe de la cuota').nextSibling).toHaveTextContent('$ 462.500,50')
    expect(d.getByText('Punitorio').nextSibling).toHaveTextContent('$ 9.250,01 · 4 días de atraso')
    expect(d.getByText('Total cobrado').nextSibling).toHaveTextContent('$ 471.750,51')
    expect(d.getByText('Recibo').nextSibling).toHaveTextContent('N° 00000012 · punto de venta 1')
    expect(screen.getByText('Cobrado')).toBeInTheDocument()
  })

  it('🔴 abre el PDF del recibo en otra pestaña', async () => {
    servirCobro(COBRO)
    montar(COBRO)
    const pdf = await screen.findByRole('link', { name: /Abrir el recibo/ })
    expect(pdf).toHaveAttribute('href', '/api/cobros/40/recibo.pdf')
    expect(pdf).toHaveAttribute('target', '_blank')
  })

  it('con qué pagó: cada medio con su nombre, su referencia y su monto', async () => {
    servirCobro(COBRO)
    montar(COBRO)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })
    const tarjeta = screen.getByText('Con qué pagó').closest('[data-slot="card"]') as HTMLElement
    const filas = within(tarjeta).getAllByRole('row')
    expect(filas[1]).toHaveTextContent('Efectivo')
    expect(filas[1]).toHaveTextContent('$ 400.000,00')
    expect(filas[2]).toHaveTextContent('Transferencia')
    expect(filas[2]).toHaveTextContent('OP-998877')
    expect(filas[2]).toHaveTextContent('$ 71.750,51')
  })

  it('🔴 las imputaciones salen agrupadas por propietario, con el subtotal de cada uno y el total, sumados en centavos', async () => {
    servirCobro(COBRO)
    montar(COBRO)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })
    const tarjeta = screen.getByText('A quién le tocó').closest('[data-slot="card"]') as HTMLElement
    const t = within(tarjeta)

    expect(t.getByText('Ana Inventada').closest('tr')).toHaveTextContent('Alquiler$ 270.000,00')
    expect(t.getByText('Total de Ana Inventada').closest('tr')).toHaveTextContent('$ 275.100,15')
    expect(t.getByText('Total de Beto Ejemplo').closest('tr')).toHaveTextContent('$ 183.400,10')
    expect(t.getByText('Total imputado a propietarios').closest('tr')).toHaveTextContent('$ 458.500,25')
    expect(t.getAllByText('Conceptos')).toHaveLength(2)
  })

  it('un cobro que no existe muestra el error del servidor', async () => {
    servidor({ 'GET /api/cobros/99': error(404, 'El cobro no existe.') })
    montar({ ...COBRO, id: 99 })
    expect(await screen.findByRole('alert')).toHaveTextContent('El cobro no existe.')
  })
})

describe('Cobro — pago a cuenta (ADR-010)', () => {
  it('🔴 un pago a cuenta se marca, y lo que muestra de la cuota es lo que este pago aplicó (no el total de la cuota)', async () => {
    servirCobro(COBRO_A_CUENTA)
    montar(COBRO_A_CUENTA)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })

    expect(screen.getByText('Pago a cuenta')).toBeInTheDocument()
    const d = within(screen.getByText('Datos del cobro').closest('[data-slot="card"]') as HTMLElement)
    expect(d.getByText('Aplicado a la cuota').nextSibling).toHaveTextContent('$ 200.000,00')
    expect(d.queryByText('Importe de la cuota')).not.toBeInTheDocument()
    expect(d.getByText('Total cobrado').nextSibling).toHaveTextContent('$ 200.000,00')
    expect(d.getByText('Recibo').nextSibling).toHaveTextContent('Pago a cuenta del alquiler noviembre 2026')
    expect(d.getByText('Recibo').nextSibling).toHaveTextContent('saldo pendiente 262500.50')
    // Cubrió todo el punitorio: no hay pendiente.
    expect(d.queryByText('Punitorio pendiente')).not.toBeInTheDocument()
  })

  it('🔴 si el pago no alcanzó para todo el punitorio, muestra cuánto quedó pendiente y que la cuota no recibió nada', async () => {
    const soloPunitorio = { ...COBRO_A_CUENTA, importe_cuota: '0.00', punitorio: '5000.00', punitorio_pendiente: '4250.01', total: '5000.00' }
    servirCobro(soloPunitorio)
    montar(soloPunitorio)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })

    const d = within(screen.getByText('Datos del cobro').closest('[data-slot="card"]') as HTMLElement)
    expect(d.getByText('Punitorio pendiente').nextSibling).toHaveTextContent('$ 4.250,01')
    expect(d.getByText('Punitorio pendiente').nextSibling).toHaveTextContent('se arrastra al próximo cobro')
    expect(d.getByText('Aplicado a la cuota').nextSibling).toHaveTextContent('$ 0,00')
  })

  it.each([
    ['común', COBRO],
    // El que salda el resto de la cuota aplica menos que ella, pero su recibo ya no dice «a cuenta».
    ['que salda el resto', { ...COBRO_A_CUENTA, id: 46, recibo: { ...COBRO_A_CUENTA.recibo!, concepto: 'Alquiler noviembre 2026, Avenida Ficticia 456 (C-000005)' } }],
  ])('un cobro %s no es un pago a cuenta: ni marca, ni punitorio pendiente', async (_cual, cobro) => {
    servirCobro(cobro)
    montar(cobro)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })
    expect(screen.queryByText('Pago a cuenta')).not.toBeInTheDocument()
    expect(screen.getByText('Importe de la cuota')).toBeInTheDocument()
    expect(screen.queryByText('Punitorio pendiente')).not.toBeInTheDocument()
  })
})

describe('Cobro — anular', () => {
  it('🔴 pide el motivo, lo manda, y deja el cobro anulado con su motivo y sin el botón de anular', async () => {
    const user = userEvent.setup()
    const api = servirCobro(COBRO)
    api.responder('POST /api/cobros/40/anular', json({ ...COBRO_ANULADO, id: 40 }))
    montar(COBRO)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })

    await user.click(screen.getByRole('button', { name: 'Anular' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/primero hay que anular la liquidación/)).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Se cobró dos veces')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular cobro' }))

    await waitFor(() => expect(api.de('POST', '/api/cobros/40/anular')).toHaveLength(1))
    expect(api.de('POST', '/api/cobros/40/anular')[0].cuerpo).toEqual({ motivo: 'Se cobró dos veces' })
    expect(await screen.findByText('Anulado: Se cobró dos veces (operador1)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
  })

  it('🔴 si el cobro está en una liquidación el servidor lo rechaza y el motivo se ve en el diálogo; el cobro sigue vigente', async () => {
    const user = userEvent.setup()
    const api = servirCobro(COBRO)
    api.responder('POST /api/cobros/40/anular', error(409, 'El cobro ya está en una liquidación al propietario: anulá primero la liquidación.'))
    montar(COBRO)
    await screen.findByRole('heading', { name: 'Cobro del 14-11-2026' })

    await user.click(screen.getByRole('button', { name: 'Anular' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Error')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular cobro' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('anulá primero la liquidación')
    expect(screen.queryByText(/^Anulado:/)).not.toBeInTheDocument()
  })

  it('un cobro ya anulado no ofrece anular', async () => {
    servirCobro(COBRO_ANULADO)
    montar(COBRO_ANULADO)
    await screen.findByText('Anulado: Se cobró dos veces (operador1)')
    expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
  })

  it('🔴 si el cobro quedó anulado pero su recibo no se pudo anular (el motor todavía no lo hace en la misma transacción), lo avisa', async () => {
    const huerfano = { ...COBRO_ANULADO, recibo: { ...COBRO.recibo!, anulado: false } }
    servirCobro(huerfano)
    montar(huerfano)
    expect(await screen.findByText(/su recibo todavía figura vigente/)).toBeInTheDocument()
  })

  it('con el recibo anulado en regla no hay ese aviso', async () => {
    servirCobro(COBRO_ANULADO)
    montar(COBRO_ANULADO)
    await screen.findByText('Anulado: Se cobró dos veces (operador1)')
    expect(screen.queryByText(/todavía figura vigente/)).not.toBeInTheDocument()
  })
})
