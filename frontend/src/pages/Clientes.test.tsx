import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Clientes } from './Clientes'
import { json, servidor } from '@/test/servidor'

/**
 * La pantalla es la de `libra-ui/comercio/Clientes`; lo propio de LibraInmo es que corre sobre el router del motor (`/api/clientes`) y
 * que el botón «Consultar en ARCA» está apagado, porque el producto no monta `/api/consultar-cuit`. Vale además como canario del kit: si un tag
 * nuevo de `libra-ui` deja de renderizar acá, se cae en el repo del consumidor.
 */

const ANA = { id: 1, name: 'Ana Inventada', cuit_dni: '27000000011', iva_condition: 'Responsable Inscripto', phone: '1155550001', email: 'ana@ejemplo.test', address: '', activo: 1, auto_facturar: 0 }
const BETO = { id: 2, name: 'Beto Ejemplo', cuit_dni: '20000000022', iva_condition: '', phone: '', email: '', address: '', activo: 1, auto_facturar: 0 }
const DARIO = { id: 4, name: 'Darío Dadodebaja', cuit_dni: '20000000044', iva_condition: '', phone: '', email: '', address: '', activo: 0, auto_facturar: 0 }

function montar() {
  return render(
    <MemoryRouter initialEntries={['/clientes']}>
      <Routes>
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<p>FICHA DEL CLIENTE</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Clientes — el listado', () => {
  it('lista a los clientes del motor desde `/api/clientes`, con el dado de baja marcado', async () => {
    const api = servidor({ 'GET /api/clientes': json([ANA, BETO, DARIO]) })
    montar()

    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument()
    expect(await screen.findByText('Ana Inventada')).toBeInTheDocument()
    expect(screen.getByText('27000000011')).toBeInTheDocument()
    expect(screen.getByText('Beto Ejemplo')).toBeInTheDocument()
    expect(screen.getByText('Darío Dadodebaja')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(api.de('GET', '/api/clientes')).toHaveLength(1)
    // Cada nombre lleva a la ficha, que es donde se corrige.
    expect(screen.getByRole('link', { name: 'Ana Inventada' })).toHaveAttribute('href', '/clientes/1')
  })

  it('el alta no ofrece «Consultar en ARCA» (el producto no monta el padrón) y crea el cliente en `POST /api/clientes`', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/clientes': json([ANA]),
      'POST /api/clientes': json({ ...BETO, name: 'Carla Ficticia', cuit_dni: '27000000033' }),
    })
    montar()
    await screen.findByText('Ana Inventada')

    await user.click(screen.getByRole('button', { name: /Nuevo cliente/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).queryByRole('button', { name: /ARCA/ })).not.toBeInTheDocument()

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Carla Ficticia')
    await user.type(within(dialogo).getByLabelText('CUIT/DNI'), '27000000033')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => expect(api.de('POST', '/api/clientes')).toHaveLength(1))
    expect(api.de('POST', '/api/clientes')[0].cuerpo).toMatchObject({ name: 'Carla Ficticia', cuit_dni: '27000000033' })
    // Y nunca consultó el padrón: el endpoint no existe en este producto.
    expect(api.pedidos.some((p) => p.ruta.startsWith('/api/consultar-cuit'))).toBe(false)
  })

  it('dar de baja confirma y llama a `POST /api/clientes/:id/desactivar`; un inactivo se reactiva con `…/activar`', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/clientes': json([ANA, DARIO]),
      'POST /api/clientes/1/desactivar': json({ ...ANA, activo: 0 }),
      'POST /api/clientes/4/activar': json({ ...DARIO, activo: 1 }),
    })
    montar()
    await screen.findByText('Ana Inventada')

    await user.click(screen.getByRole('button', { name: 'Eliminar cliente' }))
    const confirmacion = await screen.findByRole('alertdialog')
    expect(within(confirmacion).getByText('¿Eliminar a Ana Inventada?')).toBeInTheDocument()
    await user.click(within(confirmacion).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(api.de('POST', '/api/clientes/1/desactivar')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Reactivar cliente' }))
    await waitFor(() => expect(api.de('POST', '/api/clientes/4/activar')).toHaveLength(1))
  })
})
