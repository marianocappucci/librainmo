import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiquidacionNueva } from './LiquidacionNueva'
import { CLIENTES, LIQUIDACION, PREVISUALIZACION_DE_LIQUIDACION } from '@/test/datos'
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
    expect(screen.getByText('No hay movimientos sin liquidar para este propietario hasta esa fecha.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeDisabled()
  })

  it('🔴 con neto negativo (los gastos y la comisión superan lo cobrado) lo explica y no deja emitir', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('GET /api/liquidaciones/previsualizar', json({ ...PREVISUALIZACION_DE_LIQUIDACION, cobrado: '10000.00', gastos: '51000.00', comision: '500.00', neto: '-41500.00' }))
    montar()
    await previsualizar(user)

    expect(screen.getByRole('alert')).toHaveTextContent('Los gastos y la comisión superan lo cobrado (-$ 41.500,00): no se emite una liquidación con neto negativo.')
    expect(screen.getByRole('button', { name: 'Emitir la liquidación' })).toBeDisabled()
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
