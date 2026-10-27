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
    'GET /api/propiedades': json([]),
    'GET /api/contratos': json([]),
    'GET /api/cuotas': json([]),
    'GET /api/cobros': json([]),
    'GET /api/gastos': json([]),
    'GET /api/liquidaciones': json([]),
    'GET /api/reportes/fondos-de-terceros': json({ a_pagar_a_propietarios: [], inquilinos_deudores: [], totales: [{ moneda: 'ARS', a_pagar: '0.00', adeudado: '0.00' }] }),
    'GET /api/clientes': json([]),
    'GET /api/contratos/ajustes/indices': json([]),
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
  const TODAS = ['Inicio', 'Propiedades', 'Contratos', 'Cuotas', 'Cobros', 'Gastos', 'Liquidaciones', 'Fondos de terceros', 'Usuarios', 'Actividad']

  async function menuDe(rol: string) {
    servirComo(rol)
    montar('/inicio')
    await screen.findByRole('heading', { name: 'Inicio' })
    return TODAS.filter((nombre) => enMenu(nombre))
  }

  it('el administrador ve todo', async () => {
    expect(await menuDe('admin')).toEqual(TODAS)
  })

  it('el operador ve el día a día —propiedades, contratos, cobranza y propietarios— y no la administración de la instancia', async () => {
    expect(await menuDe('operador')).toEqual([
      'Inicio', 'Propiedades', 'Contratos', 'Cuotas', 'Cobros', 'Gastos', 'Liquidaciones', 'Fondos de terceros',
    ])
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

describe('Las pantallas de propiedades y contratos cuelgan del menú', () => {
  it.each([
    ['/propiedades', 'Propiedades'],
    ['/contratos', 'Contratos'],
    ['/contratos/nuevo', 'Nuevo contrato'],
  ])('%s abre «%s», con la entrada del menú marcada', async (ruta, titulo) => {
    servirComo('operador')
    montar(ruta)
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
    // Los detalles (`/contratos/:id`, `/propiedades/:id`) heredan la entrada de su listado.
    const entrada = ruta.startsWith('/propiedades') ? 'Propiedades' : 'Contratos'
    await waitFor(() => expect(enMenu(entrada)).toHaveAttribute('data-active', 'true'))
  })

  it.each([
    ['/cuotas', 'Cuotas', 'Cuotas'],
    ['/cuotas/generar', 'Generar las cuotas del mes', 'Cuotas'],
    ['/cobros', 'Cobros', 'Cobros'],
    ['/gastos', 'Gastos', 'Gastos'],
    ['/liquidaciones', 'Liquidaciones', 'Liquidaciones'],
    ['/liquidaciones/nueva', 'Nueva liquidación', 'Liquidaciones'],
    ['/fondos-de-terceros', 'Fondos de terceros', 'Fondos de terceros'],
  ])('%s abre «%s» y deja marcada la entrada «%s» del menú', async (ruta, titulo, entrada) => {
    servirComo('operador')
    montar(ruta)
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
    await waitFor(() => expect(enMenu(entrada)).toHaveAttribute('data-active', 'true'))
  })

  it('una ficha de contrato deja marcada la entrada «Contratos» del menú', async () => {
    const api = servirComo('operador')
    api.responder('GET /api/contratos/5', json({ id: 5, numero: 'C-000005', estado: 'vigente', propiedad_id: 2, propiedad_codigo: 'P-000002', propiedad_direccion: 'Avenida Ficticia 456', inquilino_id: 3, inquilino_nombre: 'Carla Ficticia', fecha_inicio: '2026-03-01', fecha_fin: '2028-02-29', fecha_rescision: null, moneda: 'ARS', dia_vencimiento: 10, dias_gracia: 0, metodo_ajuste: 'fijo', indice_ajuste: null, indice_ajuste_nombre: null, porcentaje_ajuste: null, periodicidad_ajuste: null, punitorio_tasa: null, punitorio_base: 'diaria', punitorio_para: 'inmobiliaria', comision_pct: '0.00', deposito: null, observaciones: null, importe_vigente: '450000.00', precio_vigente_desde: '2026-03-01', precios: [], garantias: [], conceptos: [] }))
    montar('/contratos/5')
    expect(await screen.findByRole('heading', { name: 'C-000005' })).toBeInTheDocument()
    expect(enMenu('Contratos')).toHaveAttribute('data-active', 'true')
  })
})
