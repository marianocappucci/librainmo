import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClienteDetalle } from './ClienteDetalle'
import { json, servidor } from '@/test/servidor'

/**
 * La ficha es la de `libra-ui/comercio/ClienteDetalle` sobre `GET/PUT /api/clientes/:id` del motor. Lo propio de LibraInmo son las
 * variantes: sin comprobantes (no hay `/facturas`, `/presupuestos` ni `/remitos`), sin MercadoPago y sin padrón de ARCA. Es la pantalla donde
 * se corrige el nombre o el CUIT de un inquilino, propietario o garante ya dado de alta.
 */

// La forma que devuelve el router del motor: el cliente más las listas de comprobantes (vacías: la inmobiliaria no los usa).
const ANA = {
  id: 1, name: 'Ana Inventada', cuit_dni: '27000000011', iva_condition: 'Responsable Inscripto', phone: '1155550001',
  email: 'ana@ejemplo.test', address: 'Calle Inventada 123', activo: 1, auto_facturar: 0,
  alias_facturacion: [], facturas: [], presupuestos: [], remitos: [],
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/clientes/1']}>
      <Routes>
        <Route path="/clientes" element={<p>LISTADO DE CLIENTES</p>} />
        <Route path="/clientes/:id" element={<ClienteDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ClienteDetalle', () => {
  it('muestra los datos del cliente desde `GET /api/clientes/:id`, sin comprobantes ni MercadoPago', async () => {
    const api = servidor({ 'GET /api/clientes/1': json(ANA) })
    montar()

    expect(await screen.findByRole('heading', { name: 'Ana Inventada' })).toBeInTheDocument()
    expect(screen.getByText('27000000011')).toBeInTheDocument()
    expect(screen.getByText('Calle Inventada 123')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ana@ejemplo.test' })).toHaveAttribute('href', 'mailto:ana@ejemplo.test')
    expect(api.de('GET', '/api/clientes/1')).toHaveLength(1)

    // Lo que una inmobiliaria no tiene: ni el resumen ni las tablas de facturas/presupuestos/remitos, ni la bandeja de MercadoPago.
    expect(screen.queryByText('Resumen')).not.toBeInTheDocument()
    expect(screen.queryByText('Presupuestos')).not.toBeInTheDocument()
    expect(screen.queryByText(/Auto-factura MP/)).not.toBeInTheDocument()
    expect(screen.queryByText(/[Aa]lias de facturaci/)).not.toBeInTheDocument()
    // Y no hay ningún link a rutas que este producto no tiene.
    expect(document.querySelector('a[href^="/facturas"], a[href^="/presupuestos"], a[href^="/remitos"]')).toBeNull()
  })

  it('corregir el nombre y el CUIT llama a `PUT /api/clientes/:id` con los datos corregidos, sin consultar el padrón', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/clientes/1': json(ANA),
      'PUT /api/clientes/1': json({ ...ANA, name: 'Ana Corregida', cuit_dni: '27000000012' }),
    })
    montar()
    await screen.findByRole('heading', { name: 'Ana Inventada' })

    await user.click(screen.getByRole('button', { name: /Editar/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).queryByRole('button', { name: /ARCA/ })).not.toBeInTheDocument()

    const nombre = within(dialogo).getByLabelText('Nombre')
    await user.clear(nombre)
    await user.type(nombre, 'Ana Corregida')
    const cuit = within(dialogo).getByLabelText('CUIT/DNI')
    await user.clear(cuit)
    await user.type(cuit, '27000000012')
    await user.click(within(dialogo).getByRole('button', { name: /Guardar/ }))

    await waitFor(() => expect(api.de('PUT', '/api/clientes/1')).toHaveLength(1))
    expect(api.de('PUT', '/api/clientes/1')[0].cuerpo).toMatchObject({
      name: 'Ana Corregida', cuit_dni: '27000000012', email: 'ana@ejemplo.test', phone: '1155550001',
    })
    expect(api.pedidos.some((p) => p.ruta.startsWith('/api/consultar-cuit'))).toBe(false)
  })

  it('un cliente dado de baja se reactiva con `POST /api/clientes/:id/activar` y no se puede editar', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/clientes/1': json({ ...ANA, activo: 0 }),
      'POST /api/clientes/1/activar': json(ANA),
    })
    montar()
    await screen.findByRole('heading', { name: 'Ana Inventada' })
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Reactivar cliente/ }))
    await waitFor(() => expect(api.de('POST', '/api/clientes/1/activar')).toHaveLength(1))
  })
})
