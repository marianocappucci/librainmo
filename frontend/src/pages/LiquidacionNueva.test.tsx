import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiquidacionNueva } from './LiquidacionNueva'
import { CLIENTES, ITEM_DE_SALDO, ITEMS_DE_LIQUIDACION, LIQUIDACION, LIQUIDACION_DEUDORA, PREVISUALIZACION_DE_LIQUIDACION } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'
import { hoyISO } from '@/lib/fechas'

type Usuario = ReturnType<typeof userEvent.setup>

function montar(ruta = '/liquidaciones/nueva') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/liquidaciones/nueva" element={<LiquidacionNueva />} />
        <Route path="/liquidaciones/:id" element={<p>FICHA DE LA LIQUIDACIÓN</p>} />
        <Route path="/liquidaciones" element={<p>LISTA DE LIQUIDACIONES</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base() {
  return servidor({
    'GET /api/clientes': json(CLIENTES),
    'GET /api/liquidaciones/previsualizar': json(PREVISUALIZACION_DE_LIQUIDACION),
    'POST /api/liquidaciones': json(LIQUIDACION, 201),
  })
}

async function previsualizar(user: Usuario) {
  await elegirEnBuscable(user, await screen.findByRole('combobox', { name: 'Propietario' }), /Ana Inventada/)
  fireEvent.change(screen.getByLabelText('Fecha de la liquidación'), { target: { value: '2026-11-15' } })
  fireEvent.change(screen.getByLabelText('Liquidar hasta'), { target: { value: '2026-11-15' } })
  await user.click(screen.getByRole('button', { name: 'Previsualizar' }))
  await screen.findByText(/Ana Inventada — hasta el 15-11-2026/)
}

afterEach(() => vi.unstubAllGlobals())

describe('Nueva liquidación — la previsualización', () => {
  it('arranca con la fecha de hoy y no pide nada hasta previsualizar; sin propietario no se puede', async () => {
    const api = base()
    montar()
    expect(await screen.findByLabelText('Fecha de la liquidación')).toHaveValue(hoyISO())
    expect(screen.getByLabelText('Liquidar hasta')).toHaveValue(hoyISO())
    expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeDisabled()
    expect(api.de('GET', '/api/liquidaciones/previsualizar')).toHaveLength(0)
  })

  it('🔴 el propietario es SelectCliente: ofrece el alta ahí mismo', async () => {
    base()
    montar()
    expect(await screen.findByRole('button', { name: 'Agregar nuevo propietario' })).toBeInTheDocument()
  })

  it('🔴 previsualizar pide el propietario y «hasta» —sin escribir nada— y muestra los movimientos con su comisión y los cuatro totales', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)

    const pedido = api.de('GET', '/api/liquidaciones/previsualizar')[0]
    expect([pedido.query.get('propietario_id'), pedido.query.get('hasta')]).toEqual(['1', '2026-11-15'])
    expect(api.de('POST', '/api/liquidaciones')).toHaveLength(0)

    expect(screen.getByText('Cobrado a su favor').nextSibling).toHaveTextContent('$ 270.000,00')
    expect(screen.getByText('Gastos').nextSibling).toHaveTextContent('-$ 51.000,00')
    // «Comisión» es también el encabezado de una columna: se busca el rótulo del total (`dt`).
    expect(screen.getAllByText('Comisión').find((e) => e.tagName === 'DT')?.nextSibling).toHaveTextContent('-$ 13.500,00')
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('$ 205.500,00')
    const cobro = screen.getByText(/Alquiler noviembre 2026 C-000005/).closest('tr')!
    expect(cobro).toHaveTextContent('14-11-2026')
    expect(cobro).toHaveTextContent('$ 270.000,00')
    expect(cobro).toHaveTextContent('al 5,00 %')
    expect(cobro).toHaveTextContent('$ 13.500,00')
    // El gasto se descuenta (negativo) y no lleva comisión.
    const gasto = screen.getByText('Gasto: Cambio de la bomba de agua').closest('tr')!
    expect(gasto).toHaveTextContent('-$ 51.000,00')
    expect(within(gasto).getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('2 movimientos')).toBeInTheDocument()
  })

  it('llega con el propietario elegido cuando viene del reporte de fondos de terceros (`?propietario=`)', async () => {
    base()
    montar('/liquidaciones/nueva?propietario=2')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Propietario' })).toHaveValue('Beto Ejemplo'))
    expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeEnabled()
  })

  it('🔴 la moneda arranca en pesos, viaja en la previsualización y la vista dice en cuál es', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    expect(await screen.findByRole('combobox', { name: 'Moneda' })).toHaveTextContent('Pesos (ARS)')
    await previsualizar(user)

    expect(api.de('GET', '/api/liquidaciones/previsualizar')[0].query.get('moneda')).toBe('ARS')
    expect(screen.getByText(/Ana Inventada — hasta el 15-11-2026, en pesos/)).toBeInTheDocument()
    // Sin movimientos en la otra moneda no hay aviso.
    expect(screen.queryByText(/también tiene movimientos sin liquidar/)).not.toBeInTheDocument()
  })

  it('🔴 si el propietario también tiene movimientos sin liquidar en dólares lo avisa y ofrece pasar a esa moneda, que se vuelve a previsualizar', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', (p) =>
      json(
        p.query.get('moneda') === 'USD'
          ? { ...PREVISUALIZACION_DE_LIQUIDACION, moneda: 'USD', monedas_con_pendientes: ['ARS', 'USD'], neto: '1500.00', cobrado: '1500.00', gastos: '0.00', comision: '0.00' }
          : { ...PREVISUALIZACION_DE_LIQUIDACION, monedas_con_pendientes: ['ARS', 'USD'] },
      ),
    )
    montar()
    await previsualizar(user)

    expect(screen.getByText('Este propietario también tiene movimientos sin liquidar en dólares.')).toBeInTheDocument()
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('$ 205.500,00')
    await user.click(screen.getByRole('button', { name: 'Liquidar en dólares' }))

    expect(await screen.findByText(/hasta el 15-11-2026, en dólares/)).toBeInTheDocument()
    expect(api.de('GET', '/api/liquidaciones/previsualizar').at(-1)?.query.get('moneda')).toBe('USD')
    expect(screen.getByRole('combobox', { name: 'Moneda' })).toHaveTextContent('Dólares (USD)')
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('US$ 1.500,00')
    // Ahora el aviso es al revés: quedan pendientes en pesos.
    expect(screen.getByText('Este propietario también tiene movimientos sin liquidar en pesos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liquidar en pesos' })).toBeInTheDocument()
  })

  it('🔴 elegir otra moneda descarta lo previsualizado (era de otra consulta); emitir manda la moneda previsualizada', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({ ...PREVISUALIZACION_DE_LIQUIDACION, moneda: 'USD', monedas_con_pendientes: ['USD'] }))
    montar()
    await previsualizar(user)

    await user.click(screen.getByRole('combobox', { name: 'Moneda' }))
    await user.click(await screen.findByRole('option', { name: 'Dólares (USD)' }))
    expect(screen.queryByRole('button', { name: 'Emitir la liquidación' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previsualizar' }))
    await screen.findByText(/hasta el 15-11-2026, en dólares/)
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('US$ 205.500,00')
    await user.click(screen.getByRole('button', { name: 'Emitir la liquidación' }))
    expect(await screen.findByText(/Neto a pagar a Ana Inventada: US\$ 205\.500,00/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Emitir liquidación' }))

    await waitFor(() => expect(api.de('POST', '/api/liquidaciones')).toHaveLength(1))
    expect(api.de('POST', '/api/liquidaciones')[0].cuerpo).toMatchObject({ propietario_id: 1, moneda: 'USD' })
  })

  it('llega con la moneda elegida cuando viene del reporte de fondos de terceros (`?moneda=USD`); una moneda desconocida se ignora', async () => {
    base()
    const { unmount } = montar('/liquidaciones/nueva?propietario=1&moneda=USD')
    expect(await screen.findByRole('combobox', { name: 'Moneda' })).toHaveTextContent('Dólares (USD)')
    unmount()
    montar('/liquidaciones/nueva?propietario=1&moneda=EUR')
    expect(await screen.findByRole('combobox', { name: 'Moneda' })).toHaveTextContent('Pesos (ARS)')
  })

  it('«hasta» posterior a la fecha de la liquidación se avisa y no deja previsualizar', async () => {
    const user = userEvent.setup()
    const api = base()
    montar('/liquidaciones/nueva?propietario=1')
    await screen.findByLabelText('Liquidar hasta')
    fireEvent.change(screen.getByLabelText('Fecha de la liquidación'), { target: { value: '2026-11-15' } })
    fireEvent.change(screen.getByLabelText('Liquidar hasta'), { target: { value: '2026-11-20' } })

    expect(screen.getByRole('alert')).toHaveTextContent('«hasta» no puede ser posterior a la fecha de la liquidación')
    expect(screen.getByRole('button', { name: 'Previsualizar' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previsualizar' }))
    expect(api.de('GET', '/api/liquidaciones/previsualizar')).toHaveLength(0)
  })

  it('🔴 cambiar el propietario o una fecha descarta lo previsualizado: era de otra consulta y no se puede emitir', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Liquidar hasta'), { target: { value: '2026-11-10' } })
    expect(screen.queryByRole('button', { name: 'Emitir la liquidación' })).not.toBeInTheDocument()
    expect(screen.queryByText(/hasta el 15-11-2026/)).not.toBeInTheDocument()
  })

  it('🔴 cambiar de propietario también descarta lo previsualizado (no se emite la liquidación de uno con los movimientos de otro)', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeEnabled()

    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Propietario' }), /Beto Ejemplo/)
    expect(screen.queryByRole('button', { name: 'Emitir la liquidación' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Ana Inventada — hasta/)).not.toBeInTheDocument()
  })

  it('sin movimientos sin liquidar lo dice y no ofrece emitir', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({ ...PREVISUALIZACION_DE_LIQUIDACION, items: [], cobrado: '0.00', gastos: '0.00', comision: '0.00', neto: '0.00' }))
    montar()
    await previsualizar(user)
    expect(screen.getByText('No hay movimientos sin liquidar en pesos para este propietario hasta esa fecha.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeDisabled()
  })

  it('🔴 con neto negativo (los gastos y la comisión superan lo cobrado, ADR-011) avisa que se emite con saldo deudor que pasa a la próxima, y deja emitir', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({ ...PREVISUALIZACION_DE_LIQUIDACION, cobrado: '10000.00', gastos: '51000.00', comision: '500.00', neto: '-41500.00' }))
    montar()
    await previsualizar(user)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Los gastos y la comisión superan lo cobrado: el neto es -$ 41.500,00. Se va a emitir con saldo deudor: no se paga, y ese saldo pasa a la próxima liquidación de Ana Inventada en pesos, que lo descuenta.',
    )
    expect(screen.getByText('Neto (saldo deudor)').nextSibling).toHaveTextContent('-$ 41.500,00')
    // Ya no es un error ni un bloqueo.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/no se emite una liquidación con neto negativo/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeEnabled()
  })

  it('🔴 con neto negativo se emite: la confirmación habla de saldo deudor y no de pagar, y manda los mismos datos', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({ ...PREVISUALIZACION_DE_LIQUIDACION, cobrado: '10000.00', gastos: '51000.00', comision: '500.00', neto: '-41500.00' }))
    api.responder('POST /api/liquidaciones', json(LIQUIDACION_DEUDORA, 201))
    montar()
    await previsualizar(user)

    await user.click(screen.getByRole('button', { name: 'Emitir la liquidación' }))
    expect(await screen.findByText(/Saldo deudor de Ana Inventada: -\$ 41\.500,00/)).toBeInTheDocument()
    expect(screen.getByText(/La liquidación no se paga: su saldo se descuenta en la próxima del propietario en pesos/)).toBeInTheDocument()
    expect(screen.queryByText(/Neto a pagar a/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Emitir liquidación' }))

    await waitFor(() => expect(api.de('POST', '/api/liquidaciones')).toHaveLength(1))
    expect(api.de('POST', '/api/liquidaciones')[0].cuerpo).toMatchObject({ propietario_id: 1, moneda: 'ARS' })
    expect(await screen.findByText('FICHA DE LA LIQUIDACIÓN')).toBeInTheDocument()
  })

  it('🔴 con el saldo deudor de una liquidación anterior muestra el «Saldo deudor anterior» y el ítem de saldo (con enlace), y deja emitir', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({
      ...PREVISUALIZACION_DE_LIQUIDACION,
      items: [ITEM_DE_SALDO, ...ITEMS_DE_LIQUIDACION],
      saldo_anterior: '-22500.00',
      neto: '183000.00',
    }))
    montar()
    await previsualizar(user)

    expect(screen.getByText('Saldo deudor anterior').nextSibling).toHaveTextContent('-$ 22.500,00')
    expect(screen.getByText('Neto a pagar').nextSibling).toHaveTextContent('$ 183.000,00')
    const saldo = screen.getByRole('link', { name: 'Saldo deudor de la liquidación L-000005' })
    expect(saldo).toHaveAttribute('href', '/liquidaciones/65')
    expect(saldo.closest('tr')).toHaveTextContent('-$ 22.500,00')
    expect(screen.getByText('2 movimientos')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeEnabled()
  })

  it('🔴 un saldo deudor anterior solo, sin cobros ni gastos nuevos, no es un movimiento: no hay nada que liquidar', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({
      ...PREVISUALIZACION_DE_LIQUIDACION,
      items: [ITEM_DE_SALDO],
      cobrado: '0.00',
      gastos: '0.00',
      comision: '0.00',
      saldo_anterior: '-22500.00',
      neto: '-22500.00',
    }))
    montar()
    await previsualizar(user)

    expect(screen.getByText('No hay movimientos sin liquidar en pesos para este propietario hasta esa fecha.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeDisabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('un error del servidor al previsualizar se muestra y no deja una vista a medias', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', error(422, 'El propietario elegido no existe en Clientes.'))
    montar('/liquidaciones/nueva?propietario=1')
    await screen.findByLabelText('Liquidar hasta')
    await user.click(screen.getByRole('button', { name: 'Previsualizar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El propietario elegido no existe en Clientes.')
    expect(screen.queryByRole('button', { name: 'Emitir la liquidación' })).not.toBeInTheDocument()
  })
})

describe('Nueva liquidación — emitir', () => {
  it('🔴 pide confirmación con el neto; al confirmar manda propietario, fecha, hasta y observaciones, y lleva a la ficha', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)
    await user.type(screen.getByLabelText('Observaciones'), '  Incluye el arreglo de la bomba ')

    await user.click(screen.getByRole('button', { name: 'Emitir la liquidación' }))
    expect(await screen.findByText('¿Emitir la liquidación?')).toBeInTheDocument()
    expect(screen.getByText(/Neto a pagar a Ana Inventada: \$ 205\.500,00/)).toBeInTheDocument()
    expect(api.de('POST', '/api/liquidaciones')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Emitir liquidación' }))

    await waitFor(() => expect(api.de('POST', '/api/liquidaciones')).toHaveLength(1))
    expect(api.de('POST', '/api/liquidaciones')[0].cuerpo).toEqual({
      propietario_id: 1,
      fecha: '2026-11-15',
      hasta: '2026-11-15',
      moneda: 'ARS',
      observaciones: 'Incluye el arreglo de la bomba',
    })
    expect(await screen.findByText('FICHA DE LA LIQUIDACIÓN')).toBeInTheDocument()
  })

  it('sin observaciones viaja `null`; cancelar la confirmación no emite nada', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)
    await user.click(screen.getByRole('button', { name: 'Emitir la liquidación' }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(api.de('POST', '/api/liquidaciones')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Emitir la liquidación' }))
    await user.click(await screen.findByRole('button', { name: 'Emitir liquidación' }))
    await waitFor(() => expect(api.de('POST', '/api/liquidaciones')).toHaveLength(1))
    expect(api.de('POST', '/api/liquidaciones')[0].cuerpo).toMatchObject({ observaciones: null })
  })

  it('un rechazo del servidor al emitir (409) se muestra y se puede volver a intentar', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/liquidaciones', error(409, 'No hay movimientos sin liquidar para este propietario.'))
    montar()
    await previsualizar(user)
    await user.click(screen.getByRole('button', { name: 'Emitir la liquidación' }))
    await user.click(await screen.findByRole('button', { name: 'Emitir liquidación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay movimientos sin liquidar para este propietario.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeEnabled())
  })
})
