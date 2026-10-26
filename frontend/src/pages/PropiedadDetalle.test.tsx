import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PropiedadDetalle } from './PropiedadDetalle'
import { CLIENTES, PROPIEDAD, PROPIEDAD_ALQUILADA, PROPIEDAD_SIN_TITULARES, PROPIEDAD_VENDIDA } from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'

function montar(id = 1) {
  return render(
    <MemoryRouter initialEntries={[`/propiedades/${id}`]}>
      <Routes>
        <Route path="/propiedades/:id" element={<PropiedadDetalle />} />
        <Route path="/propiedades" element={<p>LISTA DE PROPIEDADES</p>} />
        <Route path="/contratos/nuevo" element={<p>CONTRATO NUEVO</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base(propiedad = PROPIEDAD) {
  return servidor({
    [`GET /api/propiedades/${propiedad.id}`]: json(propiedad),
    'GET /api/clientes': json(CLIENTES),
  })
}

const guardar = () => screen.getByRole('button', { name: 'Guardar titulares' })

afterEach(() => vi.unstubAllGlobals())

describe('Propiedad — la ficha', () => {
  it('muestra los datos de la propiedad con sus nombres legibles', async () => {
    base()
    montar()

    expect(await screen.findByRole('heading', { name: 'P-000001' })).toBeInTheDocument()
    expect(screen.getByText('Departamento')).toBeInTheDocument()
    expect(screen.getByText('Calle Inventada 123')).toBeInTheDocument()
    expect(screen.getByText('4° B')).toBeInTheDocument()
    expect(screen.getByText('Villa Ejemplo')).toBeInTheDocument()
    expect(screen.getByText('123-456')).toBeInTheDocument()
    expect(screen.getByText('Balcón al frente.')).toBeInTheDocument()
  })

  it('con contrato vigente, lo enlaza a su ficha', async () => {
    base(PROPIEDAD_ALQUILADA)
    montar(2)

    const enlace = await screen.findByRole('link', { name: 'C-000005' })
    expect(enlace).toHaveAttribute('href', '/contratos/5')
    // Con contrato vigente no se ofrece cargar otro.
    expect(screen.queryByRole('link', { name: /Nuevo contrato/ })).not.toBeInTheDocument()
  })

  it('sin contrato vigente ofrece uno nuevo, con esta propiedad ya elegida; vendida o de baja, no', async () => {
    base()
    const { unmount } = montar()
    expect(await screen.findByText('No tiene un contrato vigente.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nuevo contrato/ })).toHaveAttribute('href', '/contratos/nuevo?propiedad=1')
    unmount()

    base(PROPIEDAD_VENDIDA)
    montar(4)
    expect(await screen.findByText('No tiene un contrato vigente.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nuevo contrato/ })).not.toBeInTheDocument()
  })

  it('una propiedad que no existe muestra el error del servidor', async () => {
    servidor({ 'GET /api/propiedades/99': error(404, 'La propiedad no existe.'), 'GET /api/clientes': json([]) })
    montar(99)
    expect(await screen.findByRole('alert')).toHaveTextContent('La propiedad no existe.')
  })
})

describe('Propiedad — editar los datos', () => {
  it('abre el formulario con lo cargado, y al guardar actualiza la ficha', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('PUT /api/propiedades/1', json({ ...PROPIEDAD, localidad: 'Villa Nueva' }))
    montar()

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Dirección')).toHaveValue('Calle Inventada 123')
    expect(within(dialogo).getByLabelText('Unidad')).toHaveValue('4° B')
    await user.clear(within(dialogo).getByLabelText('Localidad'))
    await user.type(within(dialogo).getByLabelText('Localidad'), 'Villa Nueva')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.de('PUT', '/api/propiedades/1')).toHaveLength(1))
    expect(api.de('PUT', '/api/propiedades/1')[0].cuerpo).toMatchObject({
      direccion: 'Calle Inventada 123',
      unidad: '4° B',
      localidad: 'Villa Nueva',
      partida_arba: null,
      estado: 'disponible',
    })
    expect(await screen.findByText('Villa Nueva')).toBeInTheDocument()
  })

  it('🔴 una propiedad alquilada muestra su estado, pero no se cambia a mano', async () => {
    const user = userEvent.setup()
    base(PROPIEDAD_ALQUILADA)
    montar(2)

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog')
    const estado = within(dialogo).getByRole('combobox', { name: 'Estado' })
    expect(estado).toBeDisabled()
    expect(estado).toHaveTextContent('Alquilada')
    expect(within(dialogo).getByText(/La pone el contrato vigente/)).toBeInTheDocument()
  })
})

describe('Propiedad — el editor de titulares', () => {
  it('arranca con los titulares cargados, su porcentaje y el total visible', async () => {
    base()
    montar()

    expect(await screen.findByRole('combobox', { name: 'Titular 1' })).toHaveValue('Ana Inventada')
    expect(screen.getByRole('combobox', { name: 'Titular 2' })).toHaveValue('Beto Ejemplo')
    expect(screen.getByLabelText('Porcentaje 1')).toHaveValue('60,00')
    expect(screen.getByLabelText('Porcentaje 2')).toHaveValue('40,00')
    expect(screen.getByText('100,00 %')).toBeInTheDocument()
    expect(guardar()).toBeEnabled()
  })

  it('🔴 no deja guardar si no suma 100: dice cuánto suma y el botón queda deshabilitado', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.clear(screen.getByLabelText('Porcentaje 2'))
    await user.type(screen.getByLabelText('Porcentaje 2'), '30')

    expect(screen.getByText('Los porcentajes suman 90,00 % y tienen que sumar 100 %.')).toBeInTheDocument()
    expect(screen.getByText('90,00 %')).toBeInTheDocument()
    expect(guardar()).toBeDisabled()
    await user.click(guardar())
    expect(api.de('PUT', '/api/propiedades/1/titulares')).toHaveLength(0)

    // Al completar el reparto, se habilita.
    await user.clear(screen.getByLabelText('Porcentaje 2'))
    await user.type(screen.getByLabelText('Porcentaje 2'), '40')
    await waitFor(() => expect(guardar()).toBeEnabled())
  })

  it('🔴 manda la lista ENTERA —no sólo lo que cambió— con los porcentajes como texto decimal', async () => {
    const user = userEvent.setup()
    const api = base()
    const nueva = {
      ...PROPIEDAD,
      titulares: [
        { cliente_id: 1, nombre: 'Ana Inventada', porcentaje: '50.00' },
        { cliente_id: 2, nombre: 'Beto Ejemplo', porcentaje: '50.00' },
      ],
    }
    api.responder('PUT /api/propiedades/1/titulares', json(nueva))
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.clear(screen.getByLabelText('Porcentaje 1'))
    await user.type(screen.getByLabelText('Porcentaje 1'), '50')
    await user.clear(screen.getByLabelText('Porcentaje 2'))
    await user.type(screen.getByLabelText('Porcentaje 2'), '50,00')
    await user.click(guardar())

    await waitFor(() => expect(api.de('PUT', '/api/propiedades/1/titulares')).toHaveLength(1))
    // Los dos titulares, aunque sólo cambiaron los porcentajes; ni un `number` de JSON en el cuerpo.
    expect(api.de('PUT', '/api/propiedades/1/titulares')[0].cuerpo).toEqual([
      { cliente_id: 1, porcentaje: '50.00' },
      { cliente_id: 2, porcentaje: '50.00' },
    ])
    expect(await screen.findByText('Titulares guardados.')).toBeInTheDocument()
    expect(screen.getByLabelText('Porcentaje 1')).toHaveValue('50,00')
  })

  it('agrega un titular de la lista de clientes y reparte en tres sin perder un centésimo', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('PUT /api/propiedades/1/titulares', json(PROPIEDAD))
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.click(screen.getByRole('button', { name: 'Agregar titular' }))
    await elegirEnBuscable(user, screen.getByRole('combobox', { name: 'Titular 3' }), /Carla Ficticia/)
    await user.clear(screen.getByLabelText('Porcentaje 1'))
    await user.type(screen.getByLabelText('Porcentaje 1'), '33,33')
    await user.clear(screen.getByLabelText('Porcentaje 2'))
    await user.type(screen.getByLabelText('Porcentaje 2'), '33,33')
    await user.type(screen.getByLabelText('Porcentaje 3'), '33,34')

    await waitFor(() => expect(guardar()).toBeEnabled())
    await user.click(guardar())
    await waitFor(() => expect(api.de('PUT', '/api/propiedades/1/titulares')).toHaveLength(1))
    expect(api.de('PUT', '/api/propiedades/1/titulares')[0].cuerpo).toEqual([
      { cliente_id: 1, porcentaje: '33.33' },
      { cliente_id: 2, porcentaje: '33.33' },
      { cliente_id: 3, porcentaje: '33.34' },
    ])
  })

  it('una propiedad sin titulares arranca con una fila vacía y no se puede guardar así', async () => {
    base(PROPIEDAD_SIN_TITULARES)
    montar(3)

    expect(await screen.findByRole('combobox', { name: 'Titular 1' })).toHaveValue('')
    expect(screen.getByText('Elegí el titular de la fila 1.')).toBeInTheDocument()
    expect(guardar()).toBeDisabled()
    expect(screen.getByText(/Los titulares no suman 100 %/)).toBeInTheDocument()
  })

  it('un titular no se repite: el que ya está en otra fila no se puede elegir', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.click(screen.getByRole('button', { name: 'Agregar titular' }))
    await user.click(screen.getByRole('combobox', { name: 'Titular 3' }))
    const lista = await screen.findByRole('listbox')
    expect(within(lista).getByRole('option', { name: /Ana Inventada/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(lista).getByRole('option', { name: /Beto Ejemplo/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(lista).getByRole('option', { name: /Carla Ficticia/ })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('quitar una fila la saca de la lista que se manda', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('PUT /api/propiedades/1/titulares', json(PROPIEDAD))
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.click(screen.getByRole('button', { name: 'Quitar titular 2' }))
    expect(screen.getByText('Los porcentajes suman 60,00 % y tienen que sumar 100 %.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Porcentaje 1'))
    await user.type(screen.getByLabelText('Porcentaje 1'), '100')
    await user.click(guardar())

    await waitFor(() => expect(api.de('PUT', '/api/propiedades/1/titulares')).toHaveLength(1))
    expect(api.de('PUT', '/api/propiedades/1/titulares')[0].cuerpo).toEqual([{ cliente_id: 1, porcentaje: '100.00' }])
  })

  it('🔴 cada fila es un SelectCliente: ofrece dar de alta al titular ahí mismo, y el recién creado se elige solo', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/clientes', json({ id: 7, name: 'Elena Nueva', cuit_dni: '27000000077', activo: 1 }, 201))
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.click(screen.getByRole('button', { name: 'Agregar titular' }))
    // Un botón de alta por fila.
    const altas = screen.getAllByRole('button', { name: 'Agregar nuevo titular' })
    expect(altas).toHaveLength(3)
    await user.click(altas[2])
    const panel = screen.getByRole('group', { name: 'Nuevo titular' })
    await user.type(within(panel).getByLabelText('Nombre *'), 'Elena Nueva')
    await user.click(within(panel).getByRole('button', { name: 'Crear titular' }))

    await waitFor(() => expect(api.de('POST', '/api/clientes')).toHaveLength(1))
    expect(api.de('POST', '/api/clientes')[0].cuerpo).toMatchObject({ name: 'Elena Nueva' })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Titular 3' })).toHaveValue('Elena Nueva'))
  })

  it('un rechazo del servidor se muestra y lo escrito queda', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('PUT /api/propiedades/1/titulares', error(422, 'El titular elegido no existe en Clientes.'))
    montar()
    await screen.findByRole('combobox', { name: 'Titular 1' })

    await user.click(guardar())

    expect(await screen.findByRole('alert')).toHaveTextContent('El titular elegido no existe en Clientes.')
    expect(screen.getByLabelText('Porcentaje 1')).toHaveValue('60,00')
  })
})
