import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Logs } from './Logs'
import { json, servidor } from '@/test/servidor'

afterEach(() => vi.unstubAllGlobals())

const REGISTRO = {
  actividad: [
    {
      id: 1,
      ts: '2026-10-20 10:00:00',
      usuario: 'operador1',
      accion: 'crear',
      entidad: 'contrato',
      entidad_id: 5,
      descripcion: 'Contrato 5 creado',
      cambios: null,
    },
  ],
  total: 1,
  total_pages: 1,
  page: 1,
  entidades: ['contrato', 'propiedad'],
  acciones: { crear: { label: 'Alta', color: '#047857' } },
  usuarios: ['operador1'],
  accesos: [],
}

describe('Actividad (logs)', () => {
  it('🔴 pide la API en `/api/logs`, no en `/logs`: esa ruta es la de la pantalla y devolvería el JSON crudo', async () => {
    const api = servidor({ 'GET /api/logs': json(REGISTRO) })
    render(<Logs />)

    expect(await screen.findByText('Contrato 5 creado')).toBeInTheDocument()
    await waitFor(() => expect(api.pedidos.length).toBeGreaterThan(0))
    expect(api.pedidos.every((p) => p.ruta === '/api/logs')).toBe(true)
    // La fecha en dd-mm-aaaa.
    expect(screen.getByText('20-10-2026')).toBeInTheDocument()
  })
})
