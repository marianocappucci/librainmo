import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiquidacionDetalle } from './LiquidacionDetalle'
import {
  LIQUIDACION, LIQUIDACION_ANULADA, LIQUIDACION_CON_SALDO_ANTERIOR, LIQUIDACION_DEUDORA, LIQUIDACION_EN_DOLARES, LIQUIDACION_PAGADA,
  LIQUIDACION_SALDADA,
} from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'
import type { Liquidacion } from '@/lib/api'

function montar(liq: Liquidacion) {
  return render(
    <MemoryRouter initialEntries={[`/liquidaciones/${liq.id}`]}>
      <Routes>
        <Route path="/liquidaciones/:id" element={<LiquidacionDetalle />} />
        <Route path="/liquidaciones" element={<p>LISTA DE LIQUIDACIONES</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const servirLiquidacion = (liq: Liquidacion) => servidor({ [`GET /api/liquidaciones/${liq.id}`]: json(liq) })
const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre })

afterEach(() => vi.unstubAllGlobals())

describe('Liquidación — la moneda', () => {
  it('🔴 una liquidación en dólares dice su moneda y muestra totales y movimientos con «US$»; el diálogo de pago también', async () => {
    const user = userEvent.setup()
    servirLiquidacion(LIQUIDACION_EN_DOLARES)
    montar(LIQUIDACION_EN_DOLARES)
    await screen.findByRole('heading', { name: 'L-000004' })

    expect(screen.getByText('Moneda').nextSibling).toHaveTextContent('Dólares (USD)')
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('US$ 205.500,00')
    expect(screen.getByText('Gastos').nextSibling).toHaveTextContent('-US$ 51.000,00')
    const cobro = screen.getByText(/Alquiler noviembre 2026 C-000005/).closest('tr')!
    expect(cobro).toHaveTextContent('US$ 270.000,00')
    expect(cobro).toHaveTextContent('US$ 13.500,00')

    await user.click(screen.getByRole('button', { name: 'Registrar el pago' }))
    expect(await screen.findByText(/el neto de US\$ 205\.500,00/)).toBeInTheDocument()
  })
})

describe('Liquidación — las acciones según el estado', () => {
  it('🔴 emitida: registrar el pago, anular y abrir el PDF', async () => {
    servirLiquidacion(LIQUIDACION)
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })

    expect(boton('Registrar el pago')).toBeInTheDocument()
    expect(boton('Anular')).toBeInTheDocument()
    const pdf = screen.getByRole('link', { name: 'Abrir el PDF' })
    expect(pdf).toHaveAttribute('href', '/api/liquidaciones/60/pdf')
    expect(pdf).toHaveAttribute('target', '_blank')
  })

  it.each([
    ['pagada', LIQUIDACION_PAGADA],
    ['anulada', LIQUIDACION_ANULADA],
  ])('🔴 %s: sólo se mira (y se puede abrir el PDF)', async (_estado, liq) => {
    servirLiquidacion(liq)
    montar(liq)
    await screen.findByRole('heading', { name: liq.numero })
    expect(boton('Registrar el pago')).not.toBeInTheDocument()
    expect(boton('Anular')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir el PDF' })).toBeInTheDocument()
  })

  it('una liquidación que no existe muestra el error del servidor', async () => {
    servidor({ 'GET /api/liquidaciones/99': error(404, 'La liquidación no existe.') })
    montar({ ...LIQUIDACION, id: 99 })
    expect(await screen.findByRole('alert')).toHaveTextContent('La liquidación no existe.')
  })
})

describe('Liquidación — los datos', () => {
  it('muestra propietario, fechas dd-mm-aaaa, los cuatro totales y los movimientos con su comisión', async () => {
    servirLiquidacion(LIQUIDACION)
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })

    const datos = screen.getByText('Datos de la liquidación').closest('[data-slot="card"]') as HTMLElement
    const d = within(datos)
    expect(d.getByText('Liquidado hasta').nextSibling).toHaveTextContent('15-11-2026')
    expect(d.getByText('Neto a pagar').nextSibling).toHaveTextContent('$ 205.500,00')
    expect(d.getByText('Gastos').nextSibling).toHaveTextContent('-$ 51.000,00')
    const movimientos = screen.getByText('Movimientos liquidados').closest('[data-slot="card"]') as HTMLElement
    expect(within(movimientos).getByText(/Alquiler noviembre 2026 C-000005/).closest('tr')).toHaveTextContent('al 5,00 %')
    expect(within(movimientos).getByText('Gasto: Cambio de la bomba de agua').closest('tr')).toHaveTextContent('-$ 51.000,00')
  })

  it('una pagada muestra cuándo, con qué y la referencia del pago', async () => {
    servirLiquidacion(LIQUIDACION_PAGADA)
    montar(LIQUIDACION_PAGADA)
    await screen.findByRole('heading', { name: 'L-000002' })
    expect(screen.getByText('Pagada el').nextSibling).toHaveTextContent('16-11-2026')
    expect(screen.getByText('Medio de pago').nextSibling).toHaveTextContent('Transferencia')
    expect(screen.getByText('Referencia del pago').nextSibling).toHaveTextContent('TR-5544')
  })

  it('una anulada dice que sus movimientos quedaron libres', async () => {
    servirLiquidacion(LIQUIDACION_ANULADA)
    montar(LIQUIDACION_ANULADA)
    expect(await screen.findByText('Al anularla, sus movimientos quedaron libres para otra liquidación.')).toBeInTheDocument()
  })
})

describe('Liquidación — con saldo deudor (ADR-011)', () => {
  it('🔴 una deudora no ofrece «Pagar»: explica que el saldo se descuenta en la próxima, rotula el neto como saldo deudor y deja anular', async () => {
    servirLiquidacion(LIQUIDACION_DEUDORA)
    montar(LIQUIDACION_DEUDORA)
    await screen.findByRole('heading', { name: 'L-000005' })

    expect(boton('Registrar el pago')).not.toBeInTheDocument()
    expect(boton('Anular')).toBeInTheDocument()
    expect(screen.getAllByText('Con saldo deudor').length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      'neto de -$ 22.500,00): el propietario le debe ese saldo a la inmobiliaria. Esta liquidación no se paga: el saldo se descuenta en la próxima liquidación de Ana Inventada en pesos.',
    )
    expect(screen.getByText('Neto (saldo deudor)').nextSibling).toHaveTextContent('-$ 22.500,00')
    expect(screen.queryByText('Neto a pagar')).not.toBeInTheDocument()
  })

  it('🔴 una deudora se puede anular: manda el motivo y queda anulada', async () => {
    const user = userEvent.setup()
    const api = servirLiquidacion(LIQUIDACION_DEUDORA)
    api.responder('POST /api/liquidaciones/65/anular', json({ ...LIQUIDACION_ANULADA, id: 65, numero: 'L-000005' }))
    montar(LIQUIDACION_DEUDORA)
    await screen.findByRole('heading', { name: 'L-000005' })

    await user.click(boton('Anular')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/Sólo se anula una emitida o con saldo deudor, y que no esté pagada ni saldada\./)).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Faltaba un cobro')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular liquidación' }))
    await waitFor(() => expect(api.de('POST', '/api/liquidaciones/65/anular')).toHaveLength(1))
    expect(await screen.findByText('Al anularla, sus movimientos quedaron libres para otra liquidación.')).toBeInTheDocument()
  })

  it('🔴 una saldada sólo se mira: dice por cuál se saldó, con enlace a ella, y no ofrece pagar ni anular', async () => {
    servirLiquidacion(LIQUIDACION_SALDADA)
    montar(LIQUIDACION_SALDADA)
    await screen.findByRole('heading', { name: 'L-000005' })

    expect(boton('Registrar el pago')).not.toBeInTheDocument()
    expect(boton('Anular')).not.toBeInTheDocument()
    expect(screen.getAllByText('Saldada').length).toBeGreaterThan(0)
    expect(screen.getByText('Saldada por').nextSibling).toHaveTextContent('L-000006')
    expect(within(screen.getByText('Saldada por').parentElement as HTMLElement).getByRole('link', { name: 'L-000006' })).toHaveAttribute('href', '/liquidaciones/66')
    expect(screen.getByRole('status')).toHaveTextContent('Su saldo deudor ya se descontó en la liquidación L-000006. Para anularla, primero hay que anular esa.')
  })

  it('🔴 la que descontó una deuda muestra el «Saldo deudor anterior» y el ítem de saldo, con enlace a la deudora y sin contarlo como movimiento', async () => {
    servirLiquidacion(LIQUIDACION_CON_SALDO_ANTERIOR)
    montar(LIQUIDACION_CON_SALDO_ANTERIOR)
    await screen.findByRole('heading', { name: 'L-000006' })

    expect(screen.getByText('Saldo deudor anterior').nextSibling).toHaveTextContent('-$ 22.500,00')
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('$ 183.000,00')
    const movimientos = screen.getByText('Movimientos liquidados').closest('[data-slot="card"]') as HTMLElement
    const saldo = within(movimientos).getByRole('link', { name: 'Saldo deudor de la liquidación L-000005' })
    expect(saldo).toHaveAttribute('href', '/liquidaciones/65')
    expect(saldo.closest('tr')).toHaveTextContent('-$ 22.500,00')
    expect(within(movimientos).getByText('2 movimientos')).toBeInTheDocument()
  })

  it('anular la que descontó la deuda avisa que la otra vuelve a quedar con saldo deudor', async () => {
    const user = userEvent.setup()
    servirLiquidacion(LIQUIDACION_CON_SALDO_ANTERIOR)
    montar(LIQUIDACION_CON_SALDO_ANTERIOR)
    await screen.findByRole('heading', { name: 'L-000006' })
    await user.click(boton('Anular')!)
    expect(await within(await screen.findByRole('dialog')).findByText(/esa vuelve a quedar con saldo deudor/)).toBeInTheDocument()
  })

  it('una liquidación común no muestra «Saldo deudor anterior» ni explicaciones de saldo', async () => {
    servirLiquidacion(LIQUIDACION)
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })
    expect(screen.queryByText('Saldo deudor anterior')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Liquidación — pagar', () => {
  it('🔴 pide fecha, medio (transferencia, efectivo o cheque) y referencia; manda el pago y la ficha pasa a pagada sin acciones', async () => {
    const user = userEvent.setup()
    const api = servirLiquidacion(LIQUIDACION)
    api.responder('POST /api/liquidaciones/60/pagar', json({ ...LIQUIDACION_PAGADA, id: 60 }))
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })

    await user.click(boton('Registrar el pago')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/el neto de \$ 205\.500,00/)).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('combobox', { name: 'Medio de pago' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Transferencia', 'Efectivo', 'Cheque'])
    await user.click(screen.getByRole('option', { name: 'Cheque' }))
    fireEvent.change(within(dialogo).getByLabelText('Fecha del pago'), { target: { value: '2026-11-16' } })
    await user.type(within(dialogo).getByLabelText('Referencia'), '  CH-8899 ')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar el pago' }))

    await waitFor(() => expect(api.de('POST', '/api/liquidaciones/60/pagar')).toHaveLength(1))
    expect(api.de('POST', '/api/liquidaciones/60/pagar')[0].cuerpo).toEqual({ fecha: '2026-11-16', medio_pago: 'cheque', referencia: 'CH-8899' })
    await waitFor(() => expect(boton('Registrar el pago')).not.toBeInTheDocument())
    expect(screen.getByText('Pagada el')).toBeInTheDocument()
  })

  it('la fecha no puede ser anterior a la de la liquidación: el servidor lo rechaza y el motivo se ve en el diálogo', async () => {
    const user = userEvent.setup()
    const api = servirLiquidacion(LIQUIDACION)
    api.responder('POST /api/liquidaciones/60/pagar', error(422, 'El pago no puede ser anterior a la liquidación.'))
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })

    await user.click(boton('Registrar el pago')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Fecha del pago')).toHaveAttribute('min', '2026-11-15')
    fireEvent.change(within(dialogo).getByLabelText('Fecha del pago'), { target: { value: '2026-11-01' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar el pago' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El pago no puede ser anterior a la liquidación.')
  })
})

describe('Liquidación — anular', () => {
  it('🔴 pide el motivo, lo manda y la deja anulada sin movimientos ni acciones', async () => {
    const user = userEvent.setup()
    const api = servirLiquidacion(LIQUIDACION)
    api.responder('POST /api/liquidaciones/60/anular', json({ ...LIQUIDACION_ANULADA, id: 60 }))
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })

    await user.click(boton('Anular')!)
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular liquidación' }))
    expect(await within(dialogo).findByText('El motivo es obligatorio.')).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Faltaba un cobro')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular liquidación' }))

    await waitFor(() => expect(api.de('POST', '/api/liquidaciones/60/anular')).toHaveLength(1))
    expect(api.de('POST', '/api/liquidaciones/60/anular')[0].cuerpo).toEqual({ motivo: 'Faltaba un cobro' })
    expect(await screen.findByText('Al anularla, sus movimientos quedaron libres para otra liquidación.')).toBeInTheDocument()
    expect(boton('Anular')).not.toBeInTheDocument()
  })

  it('un rechazo del servidor se muestra en el diálogo', async () => {
    const user = userEvent.setup()
    const api = servirLiquidacion(LIQUIDACION)
    api.responder('POST /api/liquidaciones/60/anular', error(409, 'La liquidación está pagada: sólo se anula una emitida sin pagar.'))
    montar(LIQUIDACION)
    await screen.findByRole('heading', { name: 'L-000001' })
    await user.click(boton('Anular')!)
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Error')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular liquidación' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('sólo se anula una emitida sin pagar')
  })
})
