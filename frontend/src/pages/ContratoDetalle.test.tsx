import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ContratoDetalle } from './ContratoDetalle'
import {
  CLIENTES, CONCEPTO_EXPENSAS, CONCEPTO_SEGURO, CONTRATO_BORRADOR, CONTRATO_FINALIZADO, CONTRATO_RESCINDIDO, CONTRATO_VIGENTE,
} from '@/test/datos'
import { elegirEnBuscable } from '@/test/select-buscable'
import { error, json, servidor } from '@/test/servidor'
import type { ContratoDetalle as Contrato } from '@/lib/api'

type Usuario = ReturnType<typeof userEvent.setup>

function montar(contrato: Contrato) {
  return render(
    <MemoryRouter initialEntries={[`/contratos/${contrato.id}`]}>
      <Routes>
        <Route path="/contratos/:id" element={<ContratoDetalle />} />
        <Route path="/contratos/:id/editar" element={<p>EDICIÓN DEL CONTRATO</p>} />
        <Route path="/contratos" element={<p>LISTA DE CONTRATOS</p>} />
        <Route path="/propiedades/:id" element={<p>FICHA DE LA PROPIEDAD</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function servirContrato(contrato: Contrato) {
  return servidor({ [`GET /api/contratos/${contrato.id}`]: json(contrato), 'GET /api/clientes': json(CLIENTES) })
}

const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre })

/** Cambia una fecha: `user.type` en un `<input type="date">` depende de la máscara de cada navegador. */
function fijarFecha(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } })
}

async function elegirCerrado(user: Usuario, dialogo: HTMLElement, campo: string, opcion: string) {
  await user.click(within(dialogo).getByRole('combobox', { name: campo }))
  await user.click(await screen.findByRole('option', { name: opcion }))
}

afterEach(() => vi.unstubAllGlobals())

describe('Contrato — las acciones según el estado', () => {
  it('🔴 borrador: activar, editar y borrar; no rescindir, finalizar ni actualizar el precio', async () => {
    servirContrato(CONTRATO_BORRADOR)
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    expect(boton('Activar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/contratos/6/editar')
    expect(boton('Borrar')).toBeInTheDocument()
    expect(boton('Rescindir')).not.toBeInTheDocument()
    expect(boton('Finalizar')).not.toBeInTheDocument()
    expect(boton('Actualizar precio')).not.toBeInTheDocument()
    expect(boton('Editar observaciones')).not.toBeInTheDocument()
    // Garantías y conceptos se cargan desde el borrador.
    expect(boton('Agregar garantía')).toBeInTheDocument()
    expect(boton('Agregar concepto')).toBeInTheDocument()
  })

  it('🔴 vigente: rescindir, finalizar, actualizar el precio y editar las observaciones; no activar, editar ni borrar', async () => {
    servirContrato(CONTRATO_VIGENTE)
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    expect(boton('Rescindir')).toBeInTheDocument()
    expect(boton('Finalizar')).toBeInTheDocument()
    expect(boton('Actualizar precio')).toBeInTheDocument()
    expect(boton('Editar observaciones')).toBeInTheDocument()
    expect(boton('Activar')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(boton('Borrar')).not.toBeInTheDocument()
    expect(boton('Agregar garantía')).toBeInTheDocument()
    expect(boton('Agregar concepto')).toBeInTheDocument()
  })

  it.each([
    ['rescindido', CONTRATO_RESCINDIDO],
    ['finalizado', CONTRATO_FINALIZADO],
  ])('🔴 %s: sólo se mira — ninguna acción, ni altas ni bajas', async (_estado, contrato) => {
    servirContrato(contrato)
    montar(contrato)
    await screen.findByRole('heading', { name: contrato.numero })

    for (const nombre of ['Activar', 'Borrar', 'Rescindir', 'Finalizar', 'Actualizar precio', 'Editar observaciones', 'Agregar garantía', 'Agregar concepto']) {
      expect(boton(nombre), nombre).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    // Sin columna de acciones en las tablas.
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar garantía/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar concepto/ })).not.toBeInTheDocument()
    // Lo cargado se sigue viendo.
    expect(screen.getByText('Garantía propietaria')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toBeInTheDocument()
  })

  it('un contrato que no existe muestra el error del servidor', async () => {
    servidor({ 'GET /api/contratos/99': error(404, 'El contrato no existe.') })
    montar({ ...CONTRATO_VIGENTE, id: 99 })
    expect(await screen.findByRole('alert')).toHaveTextContent('El contrato no existe.')
  })
})

describe('Contrato — los datos', () => {
  it('muestra el contrato con fechas dd-mm-aaaa, importes en formato argentino y nombres legibles', async () => {
    servirContrato(CONTRATO_VIGENTE)
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    const datos = screen.getByText('Datos del contrato').closest('[data-slot="card"]') as HTMLElement
    const d = within(datos)
    expect(d.getByRole('link', { name: 'P-000002' })).toHaveAttribute('href', '/propiedades/2')
    expect(d.getByText('01-03-2026')).toBeInTheDocument()
    expect(d.getByText('29-02-2028')).toBeInTheDocument()
    expect(d.getByText('Alquiler vigente').parentElement).toHaveTextContent('$ 450.000,00 desde el 01-06-2026')
    expect(d.getByText('Índice oficial')).toBeInTheDocument()
    expect(d.getByText('Índice para Contratos de Locación (ICL, base 30-06-2020 = 1)')).toBeInTheDocument()
    expect(d.getByText('Trimestral')).toBeInTheDocument()
    expect(d.getByText('0,50 % por día de atraso, para la inmobiliaria')).toBeInTheDocument()
    expect(d.getByText('5,00 %')).toBeInTheDocument()
    expect(d.getByText('Depósito').parentElement).toHaveTextContent('$ 450.000,00')
    expect(d.getByText('Mascota permitida.')).toBeInTheDocument()
  })

  it('el ajuste por porcentaje muestra el porcentaje, no el índice; sin ajuste no muestra ninguno', async () => {
    const porcentaje = { ...CONTRATO_VIGENTE, metodo_ajuste: 'porcentaje', indice_ajuste: null, indice_ajuste_nombre: null, porcentaje_ajuste: '12.500' }
    servirContrato(porcentaje)
    const { unmount } = montar(porcentaje)
    await screen.findByRole('heading', { name: 'C-000005' })
    expect(screen.getByText('12,50 %')).toBeInTheDocument()
    expect(screen.queryByText('Índice')).not.toBeInTheDocument()
    unmount()

    const fijo = { ...CONTRATO_VIGENTE, metodo_ajuste: 'fijo', indice_ajuste: null, indice_ajuste_nombre: null, periodicidad_ajuste: null, punitorio_tasa: null }
    servirContrato(fijo)
    montar(fijo)
    await screen.findByRole('heading', { name: 'C-000005' })
    expect(screen.getByText('Sin ajuste (importe fijo)')).toBeInTheDocument()
    expect(screen.queryByText('Se ajusta')).not.toBeInTheDocument()
    expect(screen.getByText('Sin punitorio pactado')).toBeInTheDocument()
  })
})

describe('Contrato — activar y borrar un borrador', () => {
  it('🔴 activar pide confirmación; al confirmar llama a /activar y la ficha pasa a vigente con sus acciones', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_BORRADOR)
    api.responder('POST /api/contratos/6/activar', json({ ...CONTRATO_VIGENTE, id: 6, numero: 'C-000006' }))
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Activar')!)
    expect(await screen.findByText('¿Activar el contrato C-000006?')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos/6/activar')).toHaveLength(0) // todavía no
    await user.click(screen.getByRole('button', { name: 'Activar contrato' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/6/activar')).toHaveLength(1))
    await waitFor(() => expect(boton('Rescindir')).toBeInTheDocument())
    expect(boton('Activar')).not.toBeInTheDocument()
  })

  it('cancelar la confirmación no activa nada', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_BORRADOR)
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Activar')!)
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(api.de('POST', '/api/contratos/6/activar')).toHaveLength(0)
    expect(boton('Activar')).toBeInTheDocument()
  })

  it('🔴 si el servidor no deja activar (titulares incompletos), muestra el motivo tal cual y el contrato sigue borrador', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_BORRADOR)
    const motivo = 'La propiedad no tiene sus titulares completos (tienen que sumar 100 %): sin ellos no hay a quién liquidarle.'
    api.responder('POST /api/contratos/6/activar', error(409, motivo))
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Activar')!)
    await user.click(await screen.findByRole('button', { name: 'Activar contrato' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(motivo)
    expect(boton('Activar')).toBeInTheDocument()
    expect(boton('Rescindir')).not.toBeInTheDocument()
  })

  it('borrar pide confirmación; al confirmar llama a DELETE y vuelve a la lista', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_BORRADOR)
    api.responder('DELETE /api/contratos/6', json(null, 204))
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Borrar')!)
    expect(await screen.findByText('¿Borrar el borrador C-000006?')).toBeInTheDocument()
    expect(api.de('DELETE', '/api/contratos/6')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Borrar borrador' }))

    await waitFor(() => expect(api.de('DELETE', '/api/contratos/6')).toHaveLength(1))
    expect(await screen.findByText('LISTA DE CONTRATOS')).toBeInTheDocument()
  })
})

describe('Contrato — rescindir y finalizar uno vigente', () => {
  it('🔴 rescindir pide la fecha y las observaciones, y manda las dos; el contrato queda rescindido sin acciones', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('POST /api/contratos/5/rescindir', json(CONTRATO_RESCINDIDO))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Rescindir')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/01-03-2026 al 29-02-2028/)).toBeInTheDocument()
    fijarFecha(within(dialogo).getByLabelText('Fecha de rescisión'), '2026-09-15')
    await user.type(within(dialogo).getByLabelText('Motivo u observaciones'), 'Se muda de ciudad.')
    await user.click(within(dialogo).getByRole('button', { name: 'Rescindir contrato' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/5/rescindir')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos/5/rescindir')[0].cuerpo).toEqual({ fecha: '2026-09-15', observaciones: 'Se muda de ciudad.' })
    expect(await screen.findByText('Rescindido el')).toBeInTheDocument()
    expect(screen.getByText('15-09-2026')).toBeInTheDocument()
    expect(boton('Rescindir')).not.toBeInTheDocument()
    expect(boton('Finalizar')).not.toBeInTheDocument()
  })

  it('la fecha de rescisión fuera del contrato la rechaza el servidor y el diálogo muestra el motivo sin perder lo escrito', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('POST /api/contratos/5/rescindir', error(422, 'La fecha de rescisión tiene que estar dentro del contrato.'))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Rescindir')!)
    const dialogo = await screen.findByRole('dialog')
    fijarFecha(within(dialogo).getByLabelText('Fecha de rescisión'), '2030-01-01')
    await user.type(within(dialogo).getByLabelText('Motivo u observaciones'), 'Motivo X')
    await user.click(within(dialogo).getByRole('button', { name: 'Rescindir contrato' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('La fecha de rescisión tiene que estar dentro del contrato.')
    expect(within(dialogo).getByLabelText('Motivo u observaciones')).toHaveValue('Motivo X')
    // El contrato sigue vigente: al cerrar el diálogo, sus acciones siguen ahí.
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(boton('Finalizar')).toBeInTheDocument())
    expect(boton('Rescindir')).toBeInTheDocument()
  })

  it('finalizar pide confirmación y llama a /finalizar', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('POST /api/contratos/5/finalizar', json(CONTRATO_FINALIZADO))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Finalizar')!)
    expect(await screen.findByText('¿Finalizar el contrato C-000005?')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos/5/finalizar')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Finalizar contrato' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/5/finalizar')).toHaveLength(1))
    expect(await screen.findByText('Finalizado')).toBeInTheDocument()
    expect(boton('Finalizar')).not.toBeInTheDocument()
  })

  it('antes de la fecha de fin el servidor no deja finalizar y se ve su motivo', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('POST /api/contratos/5/finalizar', error(409, 'El contrato termina el 29-02-2028: antes de eso, se rescinde.'))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Finalizar')!)
    await user.click(await screen.findByRole('button', { name: 'Finalizar contrato' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El contrato termina el 29-02-2028: antes de eso, se rescinde.')
    expect(boton('Finalizar')).toBeInTheDocument()
  })

  it('un contrato vigente sólo cambia sus observaciones, y se manda sólo eso', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('PUT /api/contratos/5', json({ ...CONTRATO_VIGENTE, observaciones: 'Cambió el teléfono.' }))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Editar observaciones')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Observaciones')).toHaveValue('Mascota permitida.')
    await user.clear(within(dialogo).getByLabelText('Observaciones'))
    await user.type(within(dialogo).getByLabelText('Observaciones'), 'Cambió el teléfono.')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.de('PUT', '/api/contratos/5')).toHaveLength(1))
    expect(api.de('PUT', '/api/contratos/5')[0].cuerpo).toEqual({ observaciones: 'Cambió el teléfono.' })
    expect(await screen.findByText('Cambió el teléfono.')).toBeInTheDocument()
  })
})

describe('Contrato — el historial de precios', () => {
  it('muestra todos los precios con su ventana de fechas, el vigente marcado y quién los cargó', async () => {
    servirContrato(CONTRATO_VIGENTE)
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    const tarjeta = screen.getByText('Precio del alquiler').closest('[data-slot="card"]') as HTMLElement
    const filas = within(tarjeta).getAllByRole('row')
    // Encabezado + las dos filas: el vigente primero, el anterior después (no se pisa).
    expect(filas).toHaveLength(3)
    expect(filas[1]).toHaveTextContent('01-06-2026')
    expect(filas[1]).toHaveTextContent('Vigente')
    expect(filas[1]).toHaveTextContent('$ 450.000,00')
    expect(filas[1]).toHaveTextContent('Actualización manual')
    expect(filas[2]).toHaveTextContent('01-03-2026')
    expect(filas[2]).toHaveTextContent('31-05-2026')
    expect(filas[2]).toHaveTextContent('$ 400.000,00')
    expect(filas[2]).toHaveTextContent('Precio inicial')
    expect(filas[2]).toHaveTextContent('operador1')
  })

  it('🔴 «Actualizar precio» manda el importe como texto decimal y la vigencia, y la tabla suma la fila nueva', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    const actualizado: Contrato = {
      ...CONTRATO_VIGENTE,
      importe_vigente: '500000.00',
      precio_vigente_desde: '2026-12-01',
      precios: [
        { id: 4, vigencia_desde: '2026-12-01', vigencia_hasta: null, importe: '500000.00', motivo: 'manual', usuario: 'operador1' },
        { ...CONTRATO_VIGENTE.precios[0], vigencia_hasta: '2026-11-30' },
        CONTRATO_VIGENTE.precios[1],
      ],
    }
    api.responder('POST /api/contratos/5/precios', json(actualizado, 201))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Actualizar precio')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/\$ 450\.000,00 desde el 01-06-2026/)).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Nuevo alquiler'), '500.000')
    fijarFecha(within(dialogo).getByLabelText('Rige desde'), '2026-12-01')
    await user.click(within(dialogo).getByRole('button', { name: 'Actualizar precio' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/5/precios')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos/5/precios')[0].cuerpo).toEqual({ importe: '500000.00', vigencia_desde: '2026-12-01' })
    const tarjeta = screen.getByText('Precio del alquiler').closest('[data-slot="card"]') as HTMLElement
    await waitFor(() => expect(within(tarjeta).getAllByRole('row')).toHaveLength(4))
    expect(within(tarjeta).getByText('$ 500.000,00')).toBeInTheDocument()
    expect(within(tarjeta).getByText('30-11-2026')).toBeInTheDocument()
  })

  it('exige un importe mayor que cero y una vigencia; no manda nada sin ellos', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Actualizar precio')!)
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nuevo alquiler'), '0')
    await user.click(within(dialogo).getByRole('button', { name: 'Actualizar precio' }))

    expect(await within(dialogo).findByText('Escribí un importe mayor que cero, con hasta dos decimales.')).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos/5/precios')).toHaveLength(0)
  })

  it('si el servidor lo rechaza (la vigencia no es posterior a la del precio vigente) lo dice en el diálogo', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('POST /api/contratos/5/precios', error(409, 'El precio vigente arranca el 01-06-2026: el nuevo tiene que empezar después.'))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(boton('Actualizar precio')!)
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nuevo alquiler'), '500000')
    fijarFecha(within(dialogo).getByLabelText('Rige desde'), '2026-05-01')
    await user.click(within(dialogo).getByRole('button', { name: 'Actualizar precio' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El precio vigente arranca el 01-06-2026')
  })
})

describe('Contrato — las garantías', () => {
  it('lista las garantías con su tipo, garante, descripción y vencimiento', async () => {
    servirContrato(CONTRATO_VIGENTE)
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    const tarjeta = screen.getByText('Garantías').closest('[data-slot="card"]') as HTMLElement
    const fila = within(tarjeta).getAllByRole('row')[1]
    expect(fila).toHaveTextContent('Garantía propietaria')
    expect(fila).toHaveTextContent('Beto Ejemplo')
    expect(fila).toHaveTextContent('Casa en Villa Ejemplo')
    expect(fila).toHaveTextContent('29-02-2028')
  })

  it('🔴 el garante es SelectCliente con alta en el lugar; el alta manda tipo, garante, descripción y vencimiento', async () => {
    const user = userEvent.setup()
    const api = servirContrato({ ...CONTRATO_BORRADOR, garantias: [] })
    api.responder('POST /api/contratos/6/garantias', json(CONTRATO_BORRADOR, 201))
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Agregar garantía')!)
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: 'Agregar nuevo garante' })).toBeInTheDocument()
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Garante' }), /Beto Ejemplo/)
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Casa en Villa Ejemplo')
    fijarFecha(within(dialogo).getByLabelText('Vence'), '2028-02-29')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar garantía' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/6/garantias')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos/6/garantias')[0].cuerpo).toEqual({
      tipo: 'propietaria',
      garante_id: 2,
      descripcion: 'Casa en Villa Ejemplo',
      vence: '2028-02-29',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('el seguro de caución no tiene una persona detrás: no pide garante y manda `null`', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_BORRADOR)
    api.responder('POST /api/contratos/6/garantias', json(CONTRATO_BORRADOR, 201))
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Agregar garantía')!)
    const dialogo = await screen.findByRole('dialog')
    await elegirEnBuscable(user, within(dialogo).getByRole('combobox', { name: 'Garante' }), /Beto Ejemplo/)
    await elegirCerrado(user, dialogo, 'Tipo de garantía', 'Seguro de caución')
    expect(within(dialogo).queryByRole('combobox', { name: 'Garante' })).not.toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Póliza 123')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar garantía' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/6/garantias')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos/6/garantias')[0].cuerpo).toEqual({
      tipo: 'caucion',
      garante_id: null,
      descripcion: 'Póliza 123',
      vence: null,
    })
  })

  it('🔴 quitar una garantía pide confirmación y llama a DELETE; la tabla queda sin ella', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('DELETE /api/contratos/5/garantias/21', json({ ...CONTRATO_VIGENTE, garantias: [] }))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(screen.getByRole('button', { name: 'Quitar garantía Garantía propietaria' }))
    expect(await screen.findByText('¿Quitar la garantía «Garantía propietaria»?')).toBeInTheDocument()
    expect(api.de('DELETE', '/api/contratos/5/garantias/21')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Quitar garantía' }))

    await waitFor(() => expect(api.de('DELETE', '/api/contratos/5/garantias/21')).toHaveLength(1))
    expect(await screen.findByText('Sin garantías cargadas.')).toBeInTheDocument()
  })

  it('un rechazo del servidor al quitarla se muestra arriba de la ficha', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('DELETE /api/contratos/5/garantias/21', error(404, 'La garantía no es de este contrato.'))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(screen.getByRole('button', { name: 'Quitar garantía Garantía propietaria' }))
    await user.click(await screen.findByRole('button', { name: 'Quitar garantía' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La garantía no es de este contrato.')
  })
})

describe('Contrato — los conceptos', () => {
  it('lista los conceptos: sin importe es «Variable»; con importe, el monto; quién paga y si está activo', async () => {
    servirContrato(CONTRATO_VIGENTE)
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    const tarjeta = screen.getByText('Conceptos trasladables').closest('[data-slot="card"]') as HTMLElement
    const filas = within(tarjeta).getAllByRole('row')
    expect(filas[1]).toHaveTextContent('Expensas')
    expect(filas[1]).toHaveTextContent('Ordinarias')
    expect(filas[1]).toHaveTextContent('Lo paga el inquilino')
    expect(filas[1]).toHaveTextContent('Variable')
    expect(filas[2]).toHaveTextContent('Seguro')
    expect(filas[2]).toHaveTextContent('Lo paga el propietario')
    expect(filas[2]).toHaveTextContent('$ 12.500,50')
    expect(filas[2]).toHaveTextContent('Activo')
  })

  it('🔴 el alta manda concepto, quién paga, descripción e importe como texto; sin importe es variable (`null`)', async () => {
    const user = userEvent.setup()
    const api = servirContrato({ ...CONTRATO_BORRADOR, conceptos: [] })
    api.responder('POST /api/contratos/6/conceptos', json(CONTRATO_BORRADOR, 201))
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Agregar concepto')!)
    let dialogo = await screen.findByRole('dialog')
    await elegirCerrado(user, dialogo, 'Concepto', 'ABL')
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Partida 123')
    await user.type(within(dialogo).getByLabelText('Importe (ARS)'), '8.500,25')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar concepto' }))
    await waitFor(() => expect(api.de('POST', '/api/contratos/6/conceptos')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos/6/conceptos')[0].cuerpo).toEqual({
      concepto: 'abl',
      descripcion: 'Partida 123',
      paga: 'inquilino',
      importe: '8500.25',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(boton('Agregar concepto')!)
    dialogo = await screen.findByRole('dialog')
    await elegirCerrado(user, dialogo, 'Quién paga', 'Lo paga el propietario')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar concepto' }))
    await waitFor(() => expect(api.de('POST', '/api/contratos/6/conceptos')).toHaveLength(2))
    expect(api.de('POST', '/api/contratos/6/conceptos')[1].cuerpo).toEqual({
      concepto: 'expensas',
      descripcion: '',
      paga: 'propietario',
      importe: null,
    })
  })

  it('un importe de cero no es un concepto fijo: se pide mayor que cero o vacío', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_BORRADOR)
    montar(CONTRATO_BORRADOR)
    await screen.findByRole('heading', { name: 'C-000006' })

    await user.click(boton('Agregar concepto')!)
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Importe (ARS)'), '0')
    await user.click(within(dialogo).getByRole('button', { name: 'Agregar concepto' }))

    expect(await within(dialogo).findByText(/Escribí un importe mayor que cero/)).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos/6/conceptos')).toHaveLength(0)
  })

  it('editar un concepto manda sólo lo que se edita (no el tipo) y deja el importe vacío = variable', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    api.responder('PUT /api/contratos/5/conceptos/12', json(CONTRATO_VIGENTE))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(screen.getByRole('button', { name: 'Editar concepto Seguro' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('combobox', { name: 'Concepto' })).toBeDisabled()
    expect(within(dialogo).getByLabelText('Importe (ARS)')).toHaveValue('12.500,50')
    await user.clear(within(dialogo).getByLabelText('Importe (ARS)'))
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.de('PUT', '/api/contratos/5/conceptos/12')).toHaveLength(1))
    expect(api.de('PUT', '/api/contratos/5/conceptos/12')[0].cuerpo).toEqual({ descripcion: '', paga: 'propietario', importe: null })
  })

  it('🔴 la baja no borra: pone el concepto en inactivo, y se reactiva', async () => {
    const user = userEvent.setup()
    const api = servirContrato(CONTRATO_VIGENTE)
    const dadoDeBaja = { ...CONTRATO_VIGENTE, conceptos: [{ ...CONCEPTO_EXPENSAS, activo: false }, CONCEPTO_SEGURO] }
    api.responder('PUT /api/contratos/5/conceptos/11', json(dadoDeBaja))
    montar(CONTRATO_VIGENTE)
    await screen.findByRole('heading', { name: 'C-000005' })

    await user.click(screen.getByRole('button', { name: 'Dar de baja el concepto Expensas' }))
    await waitFor(() => expect(api.de('PUT', '/api/contratos/5/conceptos/11')).toHaveLength(1))
    expect(api.de('PUT', '/api/contratos/5/conceptos/11')[0].cuerpo).toEqual({ activo: false })
    expect(await screen.findByText('De baja')).toBeInTheDocument()

    // Ahora ofrece reactivarlo.
    api.responder('PUT /api/contratos/5/conceptos/11', json(CONTRATO_VIGENTE))
    await user.click(await screen.findByRole('button', { name: 'Reactivar el concepto Expensas' }))
    await waitFor(() => expect(api.de('PUT', '/api/contratos/5/conceptos/11')).toHaveLength(2))
    expect(api.de('PUT', '/api/contratos/5/conceptos/11')[1].cuerpo).toEqual({ activo: true })
    await waitFor(() => expect(screen.queryByText('De baja')).not.toBeInTheDocument())
  })
})
