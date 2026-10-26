import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Usuarios } from './Usuarios'
import { json, servidor } from '@/test/servidor'

/**
 * La pantalla es la de `libra-ui`; lo propio de LibraInmo es el `basePath`, los dos roles con sus nombres legibles y los botones de
 * eliminar. Vale además como canario del kit: si un tag nuevo de `libra-ui` deja de renderizar acá, se cae en el repo del consumidor.
 */
vi.mock('@/context/AuthContext', async () => (await import('@/test/sesion')).mockDeAuth)

const USUARIOS = [
  { id: '1', username: 'usuario', name: 'Usuario de Prueba', role: 'admin', active: true, email: '' },
  { id: '2', username: 'ana', name: 'Ana Operadora', role: 'operador', active: true, email: '' },
  { id: '3', username: 'beto', name: 'Beto Operador', role: 'operador', active: true, email: '' },
]

beforeEach(() => {
  servidor({ 'GET /api/usuarios': json(USUARIOS) })
})
afterEach(() => vi.unstubAllGlobals())

describe('Usuarios', () => {
  it('apunta a `/api/usuarios` y lista a los usuarios de la instancia', async () => {
    render(<Usuarios />)
    expect(await screen.findByText('Ana Operadora')).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/usuarios', expect.anything())
  })

  it('el alta ofrece los dos roles de LibraInmo con su nombre legible, en el orden de la matriz', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)
    await screen.findByText('Ana Operadora')

    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('combobox'))
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opciones).toEqual(['Administrador', 'Operador'])
  })

  it('«Eliminar» aparece en los otros usuarios y no en la fila propia', async () => {
    render(<Usuarios />)
    await screen.findByText('Ana Operadora')
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Eliminar/ }).length).toBe(2))
  })
})
