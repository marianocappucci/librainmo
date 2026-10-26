import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ContratoNuevo } from './ContratoNuevo'
import { CLIENTES, CONTRATO_BORRADOR, PROPIEDAD, PROPIEDAD_ALQUILADA, PROPIEDAD_VENDIDA } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'

type Usuario = ReturnType<typeof userEvent.setup>

function montar(ruta = '/contratos/nuevo') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/contratos/nuevo" element={<ContratoNuevo />} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
        <Route path="/contratos" element={<p>LISTA DE CONTRATOS</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base() {
  return servidor({
    'GET /api/propiedades': json([PROPIEDAD, PROPIEDAD_ALQUILADA, PROPIEDAD_VENDIDA]),
    'GET /api/clientes': json(CLIENTES),
    'POST /api/contratos': json(CONTRATO_BORRADOR, 201),
  })
}

async function elegirCerrado(user: Usuario, campo: string, opcion: string) {
  await user.click(screen.getByRole('combobox', { name: campo }))
  await user.click(await screen.findByRole('option', { name: opcion }))
}

/** Lo mínimo de un contrato: propiedad, inquilino, plazo y alquiler. */
async function cargarLoBasico(user: Usuario) {
  await elegirEnBuscable(user, await screen.findByRole('combobox', { name: 'Propiedad' }), /P-000001/)
  await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Inquilino' }), /Carla Ficticia/)
  await user.type(screen.getByLabelText('Fecha de inicio'), '2026-11-01')
  await user.type(screen.getByLabelText('Fecha de fin'), '2028-10-31')
  await user.type(screen.getByLabelText('Alquiler inicial'), '450.000,00')
}

const enviar = (user: Usuario) => user.click(screen.getByRole('button', { name: 'Crear contrato' }))

afterEach(() => vi.unstubAllGlobals())

describe('Contrato nuevo — los campos según el método de ajuste', () => {
  it('«sin ajuste» (el de arranque) no pide índice, porcentaje ni cada cuánto se ajusta', async () => {
    base()
    montar()
    await screen.findByRole('combobox', { name: 'Propiedad' })

    expect(screen.getByRole('combobox', { name: 'Método de ajuste' })).toHaveTextContent('Sin ajuste (importe fijo)')
    expect(screen.queryByRole('combobox', { name: 'Índice' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Porcentaje de cada ajuste')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Se ajusta cada' })).not.toBeInTheDocument()
    expect(screen.getByText('El alquiler no se ajusta: se mantiene en el importe inicial.')).toBeInTheDocument()
  })

  it('🔴 «índice oficial» muestra el índice (los siete del catálogo) y cada cuánto, y los exige', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await cargarLoBasico(user)

    await elegirCerrado(user, 'Método de ajuste', 'Índice oficial')
    expect(screen.getByRole('combobox', { name: 'Índice' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Se ajusta cada' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Porcentaje de cada ajuste')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Índice' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'ICL (BCRA)', 'IPC nivel (INDEC)', 'IPC, variación mensual', 'CER', 'UVA', 'Dólar A 3500', 'Casa Propia',
    ])
    await user.keyboard('{Escape}')

    await enviar(user)
    expect(await screen.findByText('Elegí el índice.')).toBeInTheDocument()
    expect(screen.getByText('Elegí cada cuánto se ajusta.')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos')).toHaveLength(0)

    await elegirCerrado(user, 'Índice', 'ICL (BCRA)')
    await elegirCerrado(user, 'Se ajusta cada', 'Trimestral')
    await enviar(user)
    await waitFor(() => expect(api.de('POST', '/api/contratos')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos')[0].cuerpo).toMatchObject({
      metodo_ajuste: 'indice',
      indice_ajuste: 'icl',
      periodicidad_ajuste: 'trimestral',
      porcentaje_ajuste: null,
    })
  })

  it('🔴 «porcentaje pactado» muestra el porcentaje y cada cuánto, y los exige; sin índice', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await cargarLoBasico(user)

    await elegirCerrado(user, 'Método de ajuste', 'Porcentaje pactado')
    expect(screen.getByLabelText('Porcentaje de cada ajuste')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Se ajusta cada' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Índice' })).not.toBeInTheDocument()

    await enviar(user)
    expect(await screen.findByText('Escribí el porcentaje de cada ajuste, mayor que cero (hasta tres decimales).')).toBeInTheDocument()
    expect(screen.getByText('Elegí cada cuánto se ajusta.')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos')).toHaveLength(0)

    await user.type(screen.getByLabelText('Porcentaje de cada ajuste'), '12,5')
    await elegirCerrado(user, 'Se ajusta cada', 'Semestral')
    await enviar(user)
    await waitFor(() => expect(api.de('POST', '/api/contratos')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos')[0].cuerpo).toMatchObject({
      metodo_ajuste: 'porcentaje',
      porcentaje_ajuste: '12.500',
      periodicidad_ajuste: 'semestral',
      indice_ajuste: null,
    })
  })

  it('cambiar de método descarta lo cargado del anterior: el servidor rechaza «sin ajuste» con índice', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await cargarLoBasico(user)

    await elegirCerrado(user, 'Método de ajuste', 'Índice oficial')
    await elegirCerrado(user, 'Índice', 'IPC nivel (INDEC)')
    await elegirCerrado(user, 'Se ajusta cada', 'Anual')
    await elegirCerrado(user, 'Método de ajuste', 'Sin ajuste (importe fijo)')
    await enviar(user)

    await waitFor(() => expect(api.de('POST', '/api/contratos')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos')[0].cuerpo).toMatchObject({
      metodo_ajuste: 'fijo',
      indice_ajuste: null,
      porcentaje_ajuste: null,
      periodicidad_ajuste: null,
    })
  })
})

describe('Contrato nuevo — el alta', () => {
  it('manda el cuerpo completo con los importes y porcentajes como texto decimal, y lleva a la ficha', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await cargarLoBasico(user)
    await user.clear(screen.getByLabelText('Días de gracia'))
    await user.type(screen.getByLabelText('Días de gracia'), '3')
    await user.type(screen.getByLabelText('Depósito'), '450000')
    await user.type(screen.getByLabelText('Punitorio (tasa en %)'), '0,5')
    await elegirCerrado(user, 'El punitorio es para', 'El propietario')
    await user.clear(screen.getByLabelText('Comisión (%)'))
    await user.type(screen.getByLabelText('Comisión (%)'), '5')
    await user.type(screen.getByLabelText('Observaciones'), '  Mascota permitida. ')
    await enviar(user)

    await waitFor(() => expect(api.de('POST', '/api/contratos')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos')[0].cuerpo).toEqual({
      propiedad_id: 1,
      inquilino_id: 3,
      fecha_inicio: '2026-11-01',
      fecha_fin: '2028-10-31',
      importe_inicial: '450000.00',
      moneda: 'ARS',
      dia_vencimiento: 10,
      dias_gracia: 3,
      metodo_ajuste: 'fijo',
      indice_ajuste: null,
      porcentaje_ajuste: null,
      periodicidad_ajuste: null,
      punitorio_tasa: '0.5000',
      punitorio_base: 'diaria',
      punitorio_para: 'propietario',
      comision_pct: '5.00',
      deposito: '450000.00',
      observaciones: 'Mascota permitida.',
    })
    expect(await screen.findByText('FICHA DEL CONTRATO')).toBeInTheDocument()
  })

  it('exige propiedad, inquilino, fechas y alquiler, y no manda nada sin ellos', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByRole('combobox', { name: 'Propiedad' })

    await enviar(user)

    expect(await screen.findByText('Elegí la propiedad.')).toBeInTheDocument()
    expect(screen.getByText('Elegí el inquilino.')).toBeInTheDocument()
    expect(screen.getByText('La fecha de inicio es obligatoria.')).toBeInTheDocument()
    expect(screen.getByText('La fecha de fin es obligatoria.')).toBeInTheDocument()
    expect(screen.getByText('El alquiler inicial es obligatorio.')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos')).toHaveLength(0)
  })

  it.each([
    ['Alquiler inicial', '0', 'Escribí un importe mayor que cero, con hasta dos decimales (por ejemplo 450.000,00).'],
    ['Alquiler inicial', 'mucho', 'Escribí un importe mayor que cero, con hasta dos decimales (por ejemplo 450.000,00).'],
    ['Alquiler inicial', '100,555', 'Escribí un importe mayor que cero, con hasta dos decimales (por ejemplo 450.000,00).'],
    ['Día de vencimiento', '32', 'El día de vencimiento va del 1 al 31.'],
    ['Comisión (%)', '101', 'La comisión va de 0 a 100 %.'],
    ['Punitorio (tasa en %)', 'abc', 'Escribí la tasa en porcentaje, con hasta cuatro decimales (0,5 es medio por ciento).'],
  ])('%s = «%s» → «%s»', async (campo, valor, mensaje) => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await cargarLoBasico(user)
    await user.clear(screen.getByLabelText(campo))
    await user.type(screen.getByLabelText(campo), valor)
    await enviar(user)

    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos')).toHaveLength(0)
  })

  it('la fecha de fin no puede ser anterior a la de inicio', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await cargarLoBasico(user)
    await user.clear(screen.getByLabelText('Fecha de fin'))
    await user.type(screen.getByLabelText('Fecha de fin'), '2026-10-31')
    await enviar(user)

    expect(await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos')).toHaveLength(0)
  })

  it('un rechazo del servidor (409) se muestra y lo cargado queda', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/contratos', error(422, 'La propiedad elegida no existe.'))
    montar()
    await cargarLoBasico(user)
    await enviar(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('La propiedad elegida no existe.')
    expect(screen.getByLabelText('Alquiler inicial')).toHaveValue('450.000,00')
    expect(screen.queryByText('FICHA DEL CONTRATO')).not.toBeInTheDocument()
  })

  it('Cancelar vuelve a la lista sin guardar', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByRole('combobox', { name: 'Propiedad' })
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('LISTA DE CONTRATOS')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos')).toHaveLength(0)
  })
})

describe('Contrato nuevo — la propiedad y el inquilino', () => {
  it('llega con la propiedad elegida cuando viene de su ficha (`?propiedad=`)', async () => {
    base()
    montar('/contratos/nuevo?propiedad=1')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Propiedad' })).toHaveValue('P-000001 · Calle Inventada 123 · 4° B'))
  })

  it('las propiedades se buscan escribiendo, con su estado como pista; una vendida se ve pero no se elige', async () => {
    const user = userEvent.setup()
    base()
    montar()

    const campo = await screen.findByRole('combobox', { name: 'Propiedad' })
    await user.click(campo)
    await user.type(campo, 'Ficticia')
    expect(await screen.findByRole('option', { name: /Avenida Ficticia 456/ })).toHaveTextContent('Alquilada')
    expect(screen.queryByRole('option', { name: /Calle Inventada/ })).not.toBeInTheDocument()

    await user.clear(campo)
    await user.type(campo, 'Ruta')
    expect(await screen.findByRole('option', { name: /Ruta Supuesta/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('🔴 el inquilino es SelectCliente: el alta ahí mismo, y el recién creado queda elegido y viaja con su id', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/clientes', json({ id: 9, name: 'Nora Nueva', cuit_dni: '27000000099', activo: 1 }, 201))
    montar()
    await cargarLoBasico(user)

    await user.click(screen.getByRole('button', { name: 'Agregar nuevo inquilino' }))
    const panel = screen.getByRole('group', { name: 'Nuevo inquilino' })
    await user.type(within(panel).getByLabelText('Nombre *'), 'Nora Nueva')
    await user.type(within(panel).getByLabelText('CUIT/DNI'), '27000000099')
    await user.click(within(panel).getByRole('button', { name: 'Crear inquilino' }))

    await waitFor(() => expect(api.de('POST', '/api/clientes')).toHaveLength(1))
    expect(api.de('POST', '/api/clientes')[0].cuerpo).toMatchObject({ name: 'Nora Nueva', cuit_dni: '27000000099' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Inquilino' })).toHaveValue('Nora Nueva'))

    await enviar(user)
    await waitFor(() => expect(api.de('POST', '/api/contratos')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos')[0].cuerpo).toMatchObject({ inquilino_id: 9 })
  })

  it('un cliente dado de baja se ve, pero no se puede elegir como inquilino', async () => {
    const user = userEvent.setup()
    base()
    montar()
    const campo = await screen.findByRole('combobox', { name: 'Inquilino' })
    await user.click(campo)
    await user.type(campo, 'Darío')
    expect(await screen.findByRole('option', { name: /Darío Dadodebaja/ })).toHaveAttribute('aria-disabled', 'true')
  })
})
