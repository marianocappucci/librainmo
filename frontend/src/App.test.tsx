import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { error, json, servidor } from '@/test/servidor'

/**
 * El ruteo y el menú de punta a punta, con el `AuthProvider` REAL del kit (sesión por `/auth/me`, gate de Términos por `/terminos`) y la
 * red doblada. Lo que fija: sin sesión se ve el login; con sesión, el menú que corresponde al rol (la matriz de `app/roles.py`); los
 * Términos pendientes cortan la aplicación; y una ruta desconocida cae en Inicio.
 */

const USUARIO = (role: string) => ({ id: '1', username: 'usuario', name: 'Usuario de Prueba', role, active: true })

const TERMINOS_AL_DIA = { version: '1.0', vigente_desde: '2026-08-22', hash_texto: 'x', pendiente: false, puede_aceptar: true }

function servirComo(rol: string | null, terminos: object = TERMINOS_AL_DIA) {
  return servidor({
    'GET /auth/me': rol ? json(USUARIO(rol)) : error(401, 'not authenticated'),
    'GET /terminos': json(terminos),
    'GET /api/usuarios': json([]),
  })
}

function montar(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  )
}

const enMenu = (nombre: string) => screen.queryByRole('link', { name: nombre })

afterEach(() => vi.unstubAllGlobals())

describe('Sesión y Términos', () => {
  it('sin sesión muestra el login de LibraInmo, no el menú', async () => {
    servirComo(null)
    montar('/usuarios')

    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    expect(screen.getByText('LibraInmo')).toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument()
    expect(enMenu('Usuarios')).not.toBeInTheDocument()
  })

  it('con los Términos pendientes, muestra la pantalla de aceptación y no la aplicación', async () => {
    const api = servirComo('admin', { ...TERMINOS_AL_DIA, pendiente: true })
    api.responder('GET /terminos', (p) =>
      json({ ...TERMINOS_AL_DIA, pendiente: true, texto_html: p.query.get('texto') ? '<p>El contrato</p>' : null }),
    )
    montar()

    expect(await screen.findByRole('heading', { name: 'Términos y Condiciones del Servicio' })).toBeInTheDocument()
    expect(enMenu('Inicio')).not.toBeInTheDocument()
  })

  it('una ruta desconocida, y la raíz, caen en Inicio', async () => {
    servirComo('admin')
    montar('/no-existe')
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.getByText('Administración de alquileres')).toBeInTheDocument()
  })
})

describe('El menú sigue la matriz de roles', () => {
  const TODAS = ['Inicio', 'Usuarios', 'Actividad']

  async function menuDe(rol: string) {
    servirComo(rol)
    montar('/inicio')
    await screen.findByRole('heading', { name: 'Inicio' })
    return TODAS.filter((nombre) => enMenu(nombre))
  }

  it('el administrador ve todo', async () => {
    expect(await menuDe('admin')).toEqual(TODAS)
  })

  it('el operador ve sólo Inicio: la administración de la instancia es del administrador', async () => {
    expect(await menuDe('operador')).toEqual(['Inicio'])
  })

  it('muestra el rol con su nombre legible, no el código', async () => {
    servirComo('operador')
    montar('/inicio')
    await screen.findByRole('heading', { name: 'Inicio' })
    expect(screen.getByText('Operador')).toBeInTheDocument()
    expect(screen.getByText('LibraInmo')).toBeInTheDocument()
  })

  it('el menú marca la sección activa', async () => {
    servirComo('admin')
    montar('/inicio')
    await waitFor(() => expect(enMenu('Inicio')).toHaveAttribute('data-active', 'true'))
  })
})
