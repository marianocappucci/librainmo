import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Gastos } from './Gastos'
import { GASTO, GASTO_ANULADO, GASTO_DE_CUOTA, GASTO_EN_DOLARES, PROPIEDAD, PROPIEDAD_ALQUILADA } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/gastos']}>
      <Routes>
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/cuotas/:id" element={<p>FICHA DE LA CUOTA</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base(lista: unknown = [GASTO]) {
  return servidor({ 'GET /api/gastos': json(lista), 'GET /api/propiedades': json([PROPIEDAD, PROPIEDAD_ALQUILADA]) })
}

afterEach(() => vi.unstubAllGlobals())

describe('Gastos — el listado', () => {
  it('lista fecha, propiedad, categoría, descripción con su comprobante, el reparto entre titulares y el importe', async () => {
    const api = base()
    montar()

    expect(await screen.findByText('Cambio de la bomba de agua')).toBeInTheDocument()
    expect(screen.getByText('20-10-2026')).toBeInTheDocument()
    expect(screen.getByText('Calle Inventada 123 4° B')).toBeInTheDocument()
    expect(screen.getByText('Reparación')).toBeInTheDocument()
    expect(screen.getByText('Comprobante A-0001-123')).toBeInTheDocument()
    expect(screen.getByText('$ 85.000,00')).toBeInTheDocument()
    // El reparto entre titulares va en la fila desplegable: no se ve hasta abrirla.
    expect(screen.queryByText('Ana Inventada: $ 51.000,00')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver el reparto de Cambio de la bomba de agua' }))
    expect(await screen.findByText('Ana Inventada: $ 51.000,00')).toBeInTheDocument()
    expect(screen.getByText('Beto Ejemplo: $ 34.000,00')).toBeInTheDocument()
    expect(screen.getByText('1 gasto')).toBeInTheDocument()
    expect(api.de('GET', '/api/gastos')[0].query.has('incluir_anulados')).toBe(false)
  })

  it('filtra por propiedad, fechas y «incluir los anulados» en el servidor; los anulados se ven marcados y sin botón de anular', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Filtrar por propiedad' }), /P-000001/)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    api.responder('GET /api/gastos', json([GASTO, GASTO_ANULADO]))
    await user.click(screen.getByRole('checkbox', { name: 'Incluir los anulados' }))

    await waitFor(() => {
      const q = api.de('GET', '/api/gastos').at(-1)?.query
      expect([q?.get('propiedad_id'), q?.get('desde'), q?.get('incluir_anulados')]).toEqual(['1', '2026-10-01', 'true'])
    })
    expect(await screen.findByText('Pintura del palier')).toBeInTheDocument()
    expect(screen.getByText('Anulado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anular gasto Cambio de la bomba de agua' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular gasto Pintura del palier' })).not.toBeInTheDocument()
  })

  it('sin gastos lo dice; un error del servidor se ve arriba', async () => {
    base([])
    const { unmount } = montar()
    expect(await screen.findByText('Todavía no hay gastos cargados.')).toBeInTheDocument()
    unmount()
    servidor({ 'GET /api/gastos': error(403, 'No tenés permiso para hacer esto.'), 'GET /api/propiedades': json([]) })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })
})

describe('Gastos — la moneda', () => {
  it('🔴 cada gasto se ve en su moneda: el de dólares con «US$» (importe y reparto), el de pesos con «$»', async () => {
    const user = userEvent.setup()
    base([GASTO, GASTO_EN_DOLARES])
    montar()

    expect(await screen.findByText('US$ 300,00')).toBeInTheDocument()
    expect(screen.getByText('$ 85.000,00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver el reparto de Cambio del termotanque' }))
    expect(await screen.findByText('Ana Inventada: US$ 51.000,00')).toBeInTheDocument()
  })

  it('🔴 un gasto de una cuota no se anula suelto: sin botón de anular, con el enlace a la cuota que lo explica', async () => {
    const user = userEvent.setup()
    base([GASTO, GASTO_DE_CUOTA])
    montar()
    await screen.findByText('Seguro')

    expect(screen.queryByRole('button', { name: 'Anular gasto Seguro' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anular gasto Cambio de la bomba de agua' })).toBeInTheDocument()
    const celda = screen.getByText('Seguro').closest('tr') as HTMLElement
    expect(celda).toHaveTextContent('Se anula con ella.')
    await user.click(within(celda).getByRole('link', { name: 'ver la cuota' }))
    expect(await screen.findByText('FICHA DE LA CUOTA')).toBeInTheDocument()
  })
})

describe('Gastos — el alta', () => {
  it('🔴 manda el gasto con el importe como texto decimal, la propiedad elegida de la API y lo vacío como `null`; después recarga el listado', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/gastos', json(GASTO, 201))
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }))
    const dialogo = await screen.findByRole('dialog')
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Propiedad' }), /P-000001/)
    fireEvent.change(within(dialogo).getByLabelText('Fecha'), { target: { value: '2026-10-20' } })
    await user.type(within(dialogo).getByLabelText('Descripción'), '  Cambio de la bomba de agua ')
    await user.type(within(dialogo).getByLabelText('Importe'), '85.000')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar el gasto' }))

    await waitFor(() => expect(api.de('POST', '/api/gastos')).toHaveLength(1))
    expect(api.de('POST', '/api/gastos')[0].cuerpo).toEqual({
      propiedad_id: 1,
      fecha: '2026-10-20',
      categoria: 'reparacion',
      descripcion: 'Cambio de la bomba de agua',
      importe: '85000.00',
      moneda: 'ARS',
      comprobante: null,
    })
    await waitFor(() => expect(api.de('GET', '/api/gastos').length).toBeGreaterThan(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('🔴 el alta ofrece la moneda (pesos por omisión) y manda la elegida', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/gastos', json(GASTO_EN_DOLARES, 201))
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('combobox', { name: 'Moneda' })).toHaveTextContent('Pesos (ARS)')
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Propiedad' }), /P-000001/)
    await user.click(within(dialogo).getByRole('combobox', { name: 'Moneda' }))
    await user.click(await screen.findByRole('option', { name: 'Dólares (USD)' }))
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Cambio del termotanque')
    await user.type(within(dialogo).getByLabelText('Importe'), '300')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar el gasto' }))

    await waitFor(() => expect(api.de('POST', '/api/gastos')).toHaveLength(1))
    expect(api.de('POST', '/api/gastos')[0].cuerpo).toMatchObject({ importe: '300.00', moneda: 'USD' })
  })

  it('ofrece las seis categorías y exige propiedad, descripción e importe', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('combobox', { name: 'Categoría' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Reparación', 'Expensas extraordinarias', 'Impuesto', 'Servicio', 'Honorarios', 'Otro',
    ])
    await user.keyboard('{Escape}')

    await user.click(within(dialogo).getByRole('button', { name: 'Registrar el gasto' }))
    expect(await within(dialogo).findByText('Elegí la propiedad.')).toBeInTheDocument()
    expect(within(dialogo).getByText('La descripción es obligatoria.')).toBeInTheDocument()
    expect(within(dialogo).getByText('El importe es obligatorio.')).toBeInTheDocument()
    expect(api.de('POST', '/api/gastos')).toHaveLength(0)
  })

  it('🔴 una propiedad sin titulares completos: el servidor lo rechaza (409) y el motivo se ve en el diálogo, con lo escrito a salvo', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/gastos', error(409, 'La propiedad no tiene sus titulares completos: no hay a quién cargarle el gasto.'))
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }))
    const dialogo = await screen.findByRole('dialog')
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Propiedad' }), /P-000002/)
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Pintura')
    await user.type(within(dialogo).getByLabelText('Importe'), '1000')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar el gasto' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('no hay a quién cargarle el gasto')
    expect(within(dialogo).getByLabelText('Descripción')).toHaveValue('Pintura')
  })
})

describe('Gastos — anular', () => {
  it('🔴 pide el motivo, lo manda y recarga el listado', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/gastos/50/anular', json({ ...GASTO, anulado: true }))
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await user.click(screen.getByRole('button', { name: 'Anular gasto Cambio de la bomba de agua' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular gasto' }))
    expect(await within(dialogo).findByText('El motivo es obligatorio.')).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Cargado en la propiedad equivocada')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular gasto' }))

    await waitFor(() => expect(api.de('POST', '/api/gastos/50/anular')).toHaveLength(1))
    expect(api.de('POST', '/api/gastos/50/anular')[0].cuerpo).toEqual({ motivo: 'Cargado en la propiedad equivocada' })
    await waitFor(() => expect(api.de('GET', '/api/gastos').length).toBeGreaterThan(1))
  })

  it('🔴 un gasto que ya está en una liquidación no se anula: el motivo del servidor se ve en el diálogo', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/gastos/50/anular', error(409, 'El gasto ya está en una liquidación: anulá primero la liquidación.'))
    montar()
    await screen.findByText('Cambio de la bomba de agua')

    await user.click(screen.getByRole('button', { name: 'Anular gasto Cambio de la bomba de agua' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Error')
    await user.click(within(dialogo).getByRole('button', { name: 'Anular gasto' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('anulá primero la liquidación')
  })
})
