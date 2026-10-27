import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CuotaDetalle } from './CuotaDetalle'
import { elegirEnBuscable } from '@/test/select-buscable'
import {
  COBRO, CONCEPTOS_DEL_INQUILINO, CONTRATO_VIGENTE, CUOTA_ANULADA, CUOTA_CON_GASTOS_DEL_PROPIETARIO, CUOTA_COBRADA, CUOTA_EN_DOLARES,
  CUOTA_PENDIENTE,
} from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'
import type { Cuota } from '@/lib/api'

function montar(cuota: Cuota) {
  return render(
    <MemoryRouter initialEntries={[`/cuotas/${cuota.id}`]}>
      <Routes>
        <Route path="/cuotas/:id" element={<CuotaDetalle />} />
        <Route path="/cuotas/:id/cobrar" element={<p>COBRAR LA CUOTA</p>} />
        <Route path="/cuotas" element={<p>LISTA DE CUOTAS</p>} />
        <Route path="/cobros/:id" element={<p>FICHA DEL COBRO</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base(cuota: Cuota) {
  return servidor({
    [`GET /api/cuotas/${cuota.id}`]: json(cuota),
    'GET /api/contratos/5': json({ ...CONTRATO_VIGENTE, conceptos: CONCEPTOS_DEL_INQUILINO }),
    'GET /api/cobros': json([{ ...COBRO, id: 42, cuota_id: 31 }, { ...COBRO, id: 43, cuota_id: 31, anulado: true }]),
  })
}

const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre })

afterEach(() => vi.unstubAllGlobals())

describe('Cuota — las acciones según el estado', () => {
  it('🔴 pendiente: cobrar, anular y cargar un cargo', async () => {
    base(CUOTA_PENDIENTE)
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    expect(screen.getByRole('link', { name: 'Cobrar' })).toHaveAttribute('href', '/cuotas/30/cobrar')
    expect(boton('Anular')).toBeInTheDocument()
    expect(boton('Cargar un cargo')).toBeInTheDocument()
  })

  it.each([
    ['cobrada', CUOTA_COBRADA],
    ['anulada', CUOTA_ANULADA],
  ])('🔴 %s: sólo se mira — ni cobrar, ni anular, ni cargar cargos', async (_estado, cuota) => {
    base(cuota)
    montar(cuota)
    await screen.findByRole('heading', { name: /^Cuota de/ })

    expect(screen.queryByRole('link', { name: 'Cobrar' })).not.toBeInTheDocument()
    expect(boton('Anular')).not.toBeInTheDocument()
    expect(boton('Cargar un cargo')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toBeInTheDocument()
  })

  it('una cuota cobrada enlaza al cobro vigente (no al anulado)', async () => {
    base(CUOTA_COBRADA)
    montar(CUOTA_COBRADA)
    expect(await screen.findByRole('link', { name: 'Cobrada el 14-11-2026: ver el cobro' })).toHaveAttribute('href', '/cobros/42')
  })

  it('una cuota que no existe muestra el error del servidor', async () => {
    servidor({ 'GET /api/cuotas/99': error(404, 'La cuota no existe.') })
    montar({ ...CUOTA_PENDIENTE, id: 99 })
    expect(await screen.findByRole('alert')).toHaveTextContent('La cuota no existe.')
  })
})

describe('Cuota — los datos y las líneas', () => {
  it('muestra el período, el prorrateo, la emisión y el vencimiento en dd-mm-aaaa, y las líneas con el total en formato argentino', async () => {
    base(CUOTA_PENDIENTE)
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    const datos = screen.getByText('Datos de la cuota').closest('[data-slot="card"]') as HTMLElement
    expect(within(datos).getByText('01-11-2026 al 30-11-2026')).toBeInTheDocument()
    expect(within(datos).getByText('Mes entero')).toBeInTheDocument()
    expect(within(datos).getByText('Vence').nextSibling).toHaveTextContent('10-11-2026')
    const lineas = screen.getByText('Qué incluye').closest('[data-slot="card"]') as HTMLElement
    expect(within(lineas).getByText('Alquiler noviembre 2026').closest('tr')).toHaveTextContent('$ 450.000,00')
    expect(within(lineas).getByText('ABL').closest('tr')).toHaveTextContent('$ 12.500,50')
    expect(within(lineas).getByText('Total').closest('tr')).toHaveTextContent('$ 462.500,50')
  })

  it('una cuota prorrateada dice cuántos días cubre', async () => {
    const prorrateada = { ...CUOTA_PENDIENTE, prorrateada: true, dias_cubiertos: 11 }
    base(prorrateada)
    montar(prorrateada)
    expect(await screen.findByText('11 de 30 días')).toBeInTheDocument()
  })
})

describe('Cuota — la moneda', () => {
  it('🔴 los importes van en la moneda de la CUOTA: una en dólares se ve con «US$» aunque el contrato (que acá es de pesos) diga otra cosa', async () => {
    base(CUOTA_EN_DOLARES)
    montar(CUOTA_EN_DOLARES)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    const lineas = screen.getByText('Qué incluye').closest('[data-slot="card"]') as HTMLElement
    expect(within(lineas).getByText('Alquiler noviembre 2026').closest('tr')).toHaveTextContent('US$ 1.200,00')
    expect(within(lineas).getByText('Total').closest('tr')).toHaveTextContent('US$ 1.200,00')
    expect(within(lineas).queryByText(/^\$ /)).not.toBeInTheDocument()
  })
})

describe('Cuota — los gastos del propietario', () => {
  it('🔴 lista los gastos que se cargaron solos por cuenta del propietario, con el anulado tachado y marcado, y explica que se anulan con la cuota', async () => {
    base(CUOTA_CON_GASTOS_DEL_PROPIETARIO)
    montar(CUOTA_CON_GASTOS_DEL_PROPIETARIO)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    const tarjeta = screen.getByText('Gastos del propietario').closest('[data-slot="card"]') as HTMLElement
    expect(within(tarjeta).getByText('Seguro').closest('tr')).toHaveTextContent('$ 12.500,50')
    const anulado = within(tarjeta).getByText('Seguro anterior').closest('tr') as HTMLElement
    expect(anulado).toHaveTextContent('$ 9.000,00')
    expect(within(anulado).getByText('Anulado')).toBeInTheDocument()
    expect(within(anulado).getByText('Seguro anterior')).toHaveClass('line-through')
    expect(within(tarjeta).getByText(/se anula junto con la cuota/)).toBeInTheDocument()
    // Sólo se miran: la tarjeta no ofrece anular ningún gasto suelto.
    expect(within(tarjeta).queryByRole('button')).not.toBeInTheDocument()
  })

  it('una cuota sin gastos del propietario no muestra la tarjeta', async () => {
    base(CUOTA_PENDIENTE)
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })
    expect(screen.queryByText('Gastos del propietario')).not.toBeInTheDocument()
  })
})

describe('Cuota — cargar un cargo', () => {
  it('🔴 ofrece los conceptos del inquilino que todavía no están en la cuota (no el ABL, que ya está, ni el del propietario) y el cargo suelto', async () => {
    const user = userEvent.setup()
    base(CUOTA_PENDIENTE)
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    await user.click(boton('Cargar un cargo')!)
    const dialogo = await screen.findByRole('dialog')
    // Arranca con las expensas (el variable que falta).
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'Concepto' })).toHaveValue('Ordinarias'))
    await user.click(within(dialogo).getByRole('combobox', { name: 'Concepto' }))
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opciones).toHaveLength(2)
    expect(opciones[0]).toContain('Ordinarias')
    expect(opciones[0]).toContain('variable')
    expect(opciones[1]).toBe('Cargo suelto')
  })

  it('🔴 las expensas que llegaron después: manda el concepto y el importe como texto decimal, y la ficha suma la línea y el total nuevo', async () => {
    const user = userEvent.setup()
    const api = base(CUOTA_PENDIENTE)
    const conExpensas: Cuota = {
      ...CUOTA_PENDIENTE,
      total: '481001.00',
      lineas: [...CUOTA_PENDIENTE.lineas, { id: 3, tipo: 'concepto', concepto_id: 11, descripcion: 'Ordinarias', importe: '18500.50' }],
    }
    api.responder('POST /api/cuotas/30/lineas', json(conExpensas, 201))
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    await user.click(boton('Cargar un cargo')!)
    const dialogo = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'Concepto' })).toHaveValue('Ordinarias'))
    await user.type(within(dialogo).getByLabelText('Importe (ARS)'), '18.500,50')
    await user.click(within(dialogo).getByRole('button', { name: 'Cargar el cargo' }))

    await waitFor(() => expect(api.de('POST', '/api/cuotas/30/lineas')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/30/lineas')[0].cuerpo).toEqual({ importe: '18500.50', concepto_id: 11, descripcion: null })
    const lineas = screen.getByText('Qué incluye').closest('[data-slot="card"]') as HTMLElement
    await waitFor(() => expect(within(lineas).getByText('Total').closest('tr')).toHaveTextContent('$ 481.001,00'))
    expect(within(lineas).getByText('Ordinarias')).toBeInTheDocument()
  })

  it('un cargo suelto pide descripción y manda `concepto_id: null`', async () => {
    const user = userEvent.setup()
    const api = base(CUOTA_PENDIENTE)
    api.responder('POST /api/cuotas/30/lineas', json(CUOTA_PENDIENTE, 201))
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    await user.click(boton('Cargar un cargo')!)
    const dialogo = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'Concepto' })).toHaveValue('Ordinarias'))
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Concepto' }), 'Cargo suelto')
    await user.type(within(dialogo).getByLabelText('Importe (ARS)'), '3000')
    await user.click(within(dialogo).getByRole('button', { name: 'Cargar el cargo' }))
    expect(await within(dialogo).findByText('Un cargo suelto lleva descripción.')).toBeInTheDocument()
    expect(api.de('POST', '/api/cuotas/30/lineas')).toHaveLength(0)

    await user.type(within(dialogo).getByLabelText('Descripción'), 'Reposición de llave')
    await user.click(within(dialogo).getByRole('button', { name: 'Cargar el cargo' }))
    await waitFor(() => expect(api.de('POST', '/api/cuotas/30/lineas')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/30/lineas')[0].cuerpo).toEqual({ importe: '3000.00', concepto_id: null, descripcion: 'Reposición de llave' })
  })

  it('exige un importe mayor que cero, y un rechazo del servidor se muestra en el diálogo', async () => {
    const user = userEvent.setup()
    const api = base(CUOTA_PENDIENTE)
    api.responder('POST /api/cuotas/30/lineas', error(409, '«Ordinarias» ya está en esta cuota.'))
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    await user.click(boton('Cargar un cargo')!)
    const dialogo = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialogo).getByRole('combobox', { name: 'Concepto' })).toHaveValue('Ordinarias'))
    await user.type(within(dialogo).getByLabelText('Importe (ARS)'), '0')
    await user.click(within(dialogo).getByRole('button', { name: 'Cargar el cargo' }))
    expect(await within(dialogo).findByText('Escribí un importe mayor que cero, con hasta dos decimales.')).toBeInTheDocument()

    await user.clear(within(dialogo).getByLabelText('Importe (ARS)'))
    await user.type(within(dialogo).getByLabelText('Importe (ARS)'), '100')
    await user.click(within(dialogo).getByRole('button', { name: 'Cargar el cargo' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('«Ordinarias» ya está en esta cuota.')
  })
})

describe('Cuota — anular', () => {
  it('🔴 pide el motivo —obligatorio—, lo manda y deja la cuota anulada, sin acciones', async () => {
    const user = userEvent.setup()
    const api = base(CUOTA_PENDIENTE)
    api.responder('POST /api/cuotas/30/anular', json({ ...CUOTA_PENDIENTE, estado: 'anulada' }))
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    await user.click(boton('Anular')!)
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular cuota' }))
    expect(await within(dialogo).findByText('El motivo es obligatorio.')).toBeInTheDocument()
    expect(api.de('POST', '/api/cuotas/30/anular')).toHaveLength(0)

    await user.type(within(dialogo).getByLabelText('Motivo'), '  Se generó con el contrato equivocado ')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular cuota' }))

    await waitFor(() => expect(api.de('POST', '/api/cuotas/30/anular')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/30/anular')[0].cuerpo).toEqual({ motivo: 'Se generó con el contrato equivocado' })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Cobrar' })).not.toBeInTheDocument())
    expect(screen.getAllByText('Anulada').length).toBeGreaterThan(0)
  })

  it('un rechazo del servidor se muestra en el diálogo y el motivo queda escrito', async () => {
    const user = userEvent.setup()
    const api = base(CUOTA_PENDIENTE)
    api.responder('POST /api/cuotas/30/anular', error(409, 'La cuota está cobrada: sólo se anula una pendiente.'))
    montar(CUOTA_PENDIENTE)
    await screen.findByRole('heading', { name: 'Cuota de noviembre 2026' })

    await user.click(boton('Anular')!)
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Error')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular cuota' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('sólo se anula una pendiente')
    expect(within(dialogo).getByLabelText('Motivo')).toHaveValue('Error')
  })
})
