import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '@/App'
import { error, json, servidor } from '@/test/servidor'

/**
 * Que las dos pantallas de recuperación sean **públicas**, que el login ofrezca el enlace y que pida el captcha.
 *
 * 🔴 Lo segundo es lo que un test no obvio cubre: sin `forgotPasswordPath` el kit simplemente no pinta el enlace —la pantalla queda
 * idéntica y no falla nada—, y sin `captchaPath` el login manda el pedido sin captcha y el backend (`captcha=True`) contesta 400 a todos.
 * `App` trae su `AuthProvider` real, con la red doblada: sin sesión (`/auth/me` da 401).
 */

const DESAFIO = { parameters: { algorithm: 'SHA-256', cost: 1, keyLength: 32, nonce: 'a', salt: 'b' }, signature: 'firma' }

function sinSesion() {
  return servidor({
    'GET /auth/me': error(401, 'not authenticated'),
    'GET /auth/demo': json({ enabled: true, username: 'visitante', requiere_codigo: true }),
    'GET /auth/captcha': json(DESAFIO),
  })
}

function enLaRuta(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('recuperación de contraseña, sin sesión', () => {
  it('/forgot-password abre la pantalla de recuperación, con el captcha y el nombre del producto', async () => {
    const api = sinSesion()
    enLaRuta('/forgot-password')

    expect(await screen.findByRole('button', { name: /Enviar enlace/i })).toBeInTheDocument()
    expect(screen.getByText('LibraInmo')).toBeInTheDocument()
    // El pedido de enlace lleva captcha: se pide el desafío a la misma ruta que el login.
    await vi.waitFor(() => expect(api.de('GET', '/auth/captcha').length).toBeGreaterThan(0))
  })

  it('/reset-password con token abre la de cambio', async () => {
    sinSesion()
    enLaRuta('/reset-password?token=un-token-cualquiera')
    expect(await screen.findByRole('button', { name: /Guardar contraseña/i })).toBeInTheDocument()
  })

  it('/reset-password SIN token explica que el enlace está incompleto', async () => {
    sinSesion()
    enLaRuta('/reset-password')
    expect(await screen.findByText(/no trae el código de recuperación/i)).toBeInTheDocument()
  })

  it('el login ofrece el enlace de recuperación, el botón de la demo y pide el captcha', async () => {
    const api = sinSesion()
    enLaRuta('/login')

    const enlace = await screen.findByRole('link', { name: /Olvidaste tu contraseña/i })
    expect(enlace).toHaveAttribute('href', '/forgot-password')
    expect(await screen.findByRole('button', { name: /demo/i })).toBeInTheDocument()
    await vi.waitFor(() => expect(api.de('GET', '/auth/captcha').length).toBeGreaterThan(0))
    expect(api.de('GET', '/auth/demo').length).toBeGreaterThan(0)
  })

  it('una ruta privada sigue mandando al login', async () => {
    // Control negativo: sin él, un ruteo que mostrara la recuperación en cualquier URL pasaría los tests de arriba.
    sinSesion()
    enLaRuta('/propiedades')
    // `waitFor` y no `findBy`: con `findBy` fallaba 2 de cada 3 corridas («element could not be found»): el campo hallado ya no estaba al
    // llegar la aserción, lo que apunta a un remontado del login mientras el kit sondea `/auth/demo` y `/auth/captcha` (inferido, no medido).
    await waitFor(() => expect(screen.getByLabelText('Usuario')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Enviar enlace/i })).not.toBeInTheDocument()
  })
})
