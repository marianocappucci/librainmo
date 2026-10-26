import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Propiedades } from './Propiedades'
import { PROPIEDAD, PROPIEDAD_ALQUILADA, PROPIEDAD_SIN_TITULARES } from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'

function montar() {
  return render(
    <MemoryRouter initialEntries={['/propiedades']}>
      <Routes>
        <Route path="/propiedades" element={<Propiedades />} />
        <Route path="/propiedades/:id" element={<p>FICHA DE LA PROPIEDAD</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const LISTA = [PROPIEDAD, PROPIEDAD_ALQUILADA, PROPIEDAD_SIN_TITULARES]

afterEach(() => vi.unstubAllGlobals())

describe('Propiedades — el listado', () => {
  it('lista las propiedades con su dirección, tipo, titulares, contrato vigente y estado', async () => {
    const api = servidor({ 'GET /api/propiedades': json(LISTA) })
    montar()

    expect(await screen.findByText('Calle Inventada 123 · 4° B')).toBeInTheDocument()
    expect(screen.getByText('P-000001')).toBeInTheDocument()
    expect(screen.getByText('Avenida Ficticia 456')).toBeInTheDocument()
    // Los titulares por nombre; sin titulares, se dice.
    expect(screen.getAllByText('Ana Inventada, Beto Ejemplo')).toHaveLength(2)
    expect(screen.getByText('Sin titulares')).toBeInTheDocument()
    // El contrato vigente es un enlace a su ficha.
    expect(screen.getByRole('link', { name: 'C-000005' })).toHaveAttribute('href', '/contratos/5')
    // Estado con su nombre, no con el código.
    expect(screen.getByText('Alquilada')).toBeInTheDocument()
    expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0)
    expect(screen.getByText('3 propiedades')).toBeInTheDocument()
    // Sin filtros pide el tope de página y ningún `q` ni `estado`.
    const pedido = api.de('GET', '/api/propiedades')[0]
    expect(pedido.query.get('limit')).toBe('200')
    expect(pedido.query.has('q')).toBe(false)
    expect(pedido.query.has('estado')).toBe(false)
  })

  it('una propiedad con titulares que no suman 100 lo avisa en la fila', async () => {
    servidor({
      'GET /api/propiedades': json([{ ...PROPIEDAD, titulares_completos: false, titulares: [PROPIEDAD.titulares[0]] }]),
    })
    montar()
    expect(await screen.findByText('(incompletos)')).toBeInTheDocument()
  })

  it('buscar escribiendo pide `?q=` al servidor (sin una consulta por tecla)', async () => {
    const user = userEvent.setup()
    const api = servidor({ 'GET /api/propiedades': json(LISTA) })
    montar()
    await screen.findByText('Avenida Ficticia 456')

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'Ficticia')

    await waitFor(() => expect(api.de('GET', '/api/propiedades').at(-1)?.query.get('q')).toBe('Ficticia'))
    // Una consulta por la carga inicial y una por lo escrito; no ocho.
    expect(api.de('GET', '/api/propiedades')).toHaveLength(2)
  })

  it('filtrar por estado pide `?estado=` y «Todos los estados» lo saca', async () => {
    const user = userEvent.setup()
    const api = servidor({ 'GET /api/propiedades': json(LISTA) })
    montar()
    await screen.findByText('Avenida Ficticia 456')

    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Alquilada' }))
    await waitFor(() => expect(api.de('GET', '/api/propiedades').at(-1)?.query.get('estado')).toBe('alquilada'))

    await user.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    await user.click(await screen.findByRole('option', { name: 'Todos los estados' }))
    await waitFor(() => expect(api.de('GET', '/api/propiedades').at(-1)?.query.has('estado')).toBe(false))
  })

  it('el filtro ofrece los seis estados (en el filtro sí está «alquilada»)', async () => {
    const user = userEvent.setup()
    servidor({ 'GET /api/propiedades': json([]) })
    montar()
    await user.click(await screen.findByRole('combobox', { name: 'Filtrar por estado' }))
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opciones).toEqual(['Todos los estados', 'Disponible', 'Alquilada', 'En venta', 'Reservada', 'Vendida', 'De baja'])
  })

  it('sin propiedades, o sin coincidencias, lo dice distinto', async () => {
    const user = userEvent.setup()
    servidor({ 'GET /api/propiedades': json([]) })
    montar()
    expect(await screen.findByText('Todavía no hay propiedades cargadas.')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'nada')
    expect(await screen.findByText('Ninguna propiedad coincide con la búsqueda.')).toBeInTheDocument()
  })

  it('un error del servidor se ve arriba del listado', async () => {
    servidor({ 'GET /api/propiedades': error(403, 'No tenés permiso para hacer esto.') })
    montar()
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
  })

  it('hacer clic en una fila lleva a su ficha', async () => {
    const user = userEvent.setup()
    servidor({ 'GET /api/propiedades': json(LISTA) })
    montar()
    await user.click(await screen.findByText('Avenida Ficticia 456'))
    expect(await screen.findByText('FICHA DE LA PROPIEDAD')).toBeInTheDocument()
  })
})

describe('Propiedades — el alta', () => {
  it('🔴 «alquilada» no se ofrece al elegir el estado: la pone el contrato', async () => {
    const user = userEvent.setup()
    servidor({ 'GET /api/propiedades': json([]) })
    montar()

    await user.click(await screen.findByRole('button', { name: 'Nueva propiedad' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('combobox', { name: 'Estado' }))
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opciones).toEqual(['Disponible', 'En venta', 'Reservada', 'Vendida', 'De baja'])
  })

  it('exige la dirección y no manda nada hasta tenerla', async () => {
    const user = userEvent.setup()
    const api = servidor({ 'GET /api/propiedades': json([]) })
    montar()

    await user.click(await screen.findByRole('button', { name: 'Nueva propiedad' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(await within(dialogo).findByText('La dirección es obligatoria.')).toBeInTheDocument()
    expect(api.de('POST', '/api/propiedades')).toHaveLength(0)
  })

  it('guarda con lo vacío como `null` y lleva a la ficha, donde se cargan los titulares', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/propiedades': json([]),
      'POST /api/propiedades': json({ ...PROPIEDAD_SIN_TITULARES, id: 9 }, 201),
    })
    montar()

    await user.click(await screen.findByRole('button', { name: 'Nueva propiedad' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Dirección'), '  Calle Nueva 1 ')
    await user.type(within(dialogo).getByLabelText('Localidad'), 'Villa Ejemplo')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.de('POST', '/api/propiedades')).toHaveLength(1))
    expect(api.de('POST', '/api/propiedades')[0].cuerpo).toEqual({
      tipo: 'departamento',
      direccion: 'Calle Nueva 1',
      unidad: null,
      localidad: 'Villa Ejemplo',
      partida_abl: null,
      partida_arba: null,
      estado: 'disponible',
      observaciones: null,
    })
    expect(await screen.findByText('FICHA DE LA PROPIEDAD')).toBeInTheDocument()
  })

  it('un rechazo del servidor se muestra adentro del diálogo, con lo escrito a salvo', async () => {
    const user = userEvent.setup()
    servidor({
      'GET /api/propiedades': json([]),
      'POST /api/propiedades': error(422, 'Tipo de propiedad inválido: castillo'),
    })
    montar()

    await user.click(await screen.findByRole('button', { name: 'Nueva propiedad' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Dirección'), 'Calle Nueva 1')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Tipo de propiedad inválido: castillo')
    expect(within(dialogo).getByLabelText('Dirección')).toHaveValue('Calle Nueva 1')
  })
})
