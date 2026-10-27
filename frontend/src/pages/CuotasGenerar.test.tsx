import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CuotasGenerar } from './CuotasGenerar'
import { CUOTA_EN_DOLARES, CUOTA_PENDIENTE, PREVISUALIZACION_DE_CUOTAS, PROPUESTA_EN_DOLARES_CON_TRAMOS } from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'
import { hoyISO, mesDe } from '@/lib/fechas'

type Usuario = ReturnType<typeof userEvent.setup>

function montar() {
  return render(
    <MemoryRouter initialEntries={['/cuotas/generar']}>
      <Routes>
        <Route path="/cuotas/generar" element={<CuotasGenerar />} />
        <Route path="/cuotas" element={<p>LISTA DE CUOTAS</p>} />
        <Route path="/cuotas/:id" element={<p>FICHA DE LA CUOTA</p>} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
        <Route path="/gastos" element={<p>GASTOS</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base() {
  return servidor({
    'POST /api/cuotas/previsualizar': json(PREVISUALIZACION_DE_CUOTAS),
    'POST /api/cuotas/generar': json({ generadas: [CUOTA_PENDIENTE] }),
  })
}

async function previsualizar(user: Usuario, mes = '2026-11') {
  fireEvent.change(screen.getByLabelText('Mes'), { target: { value: mes } })
  await user.click(screen.getByRole('button', { name: 'Previsualizar' }))
  await screen.findByText(/Para generar/)
}

afterEach(() => vi.unstubAllGlobals())

describe('Generar las cuotas — la previsualización', () => {
  it('arranca en el mes de hoy y no pide nada hasta que se previsualiza', () => {
    const api = base()
    montar()
    expect(screen.getByLabelText('Mes')).toHaveValue(mesDe(hoyISO()))
    expect(api.pedidos).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Generar cuotas' })).not.toBeInTheDocument()
  })

  it('🔴 previsualizar manda el primer día del mes y no escribe nada; muestra alquiler, conceptos fijos, prorrateo y vencimiento', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)

    expect(api.de('POST', '/api/cuotas/previsualizar')[0].cuerpo).toEqual({ ancla: '2026-11-01' })
    expect(api.de('POST', '/api/cuotas/generar')).toHaveLength(0)
    expect(screen.getByText(/noviembre 2026 \(01-11-2026 al 30-11-2026\)/)).toBeInTheDocument()
    const filas = screen.getAllByRole('row')
    const c5 = filas.find((f) => within(f).queryByRole('link', { name: 'C-000005' }))!
    expect(c5).toHaveTextContent('01-11-2026')
    expect(c5).toHaveTextContent('vence 10-11-2026')
    expect(c5).toHaveTextContent('$ 450.000,00')
    expect(c5).toHaveTextContent('ABL$ 8.500,25')
    const c7 = filas.find((f) => within(f).queryByRole('link', { name: 'C-000007' }))!
    expect(c7).toHaveTextContent('prorrateo: 11 de 30 días')
    expect(c7).toHaveTextContent('$ 165.000,00')
  })

  it('las ya generadas enlazan a su cuota y las bloqueadas dicen su motivo y enlazan al contrato (donde está el ajuste)', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)

    expect(screen.getByRole('link', { name: 'ver la cuota' })).toHaveAttribute('href', '/cuotas/31')
    const bloqueadas = screen.getByText('Bloqueadas').closest('[data-slot="card"]') as HTMLElement
    expect(within(bloqueadas).getByRole('link', { name: 'C-000009' })).toHaveAttribute('href', '/contratos/9')
    expect(within(bloqueadas).getByText(/Tiene el ajuste del 01-11-2026 pendiente: aplicalo primero\./)).toBeInTheDocument()
  })

  it('un mes sin nada para generar lo dice', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/cuotas/previsualizar', json({ ...PREVISUALIZACION_DE_CUOTAS, propuestas: [], ya_generadas: [], bloqueadas: [] }))
    montar()
    await previsualizar(user)
    expect(screen.getByText('No hay cuotas para generar en este mes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generar cuotas' })).not.toBeInTheDocument()
  })

  it('un error del servidor se ve arriba y no deja una vista a medias', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/cuotas/previsualizar', error(422, 'No es una fecha válida.'))
    montar()
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-11' } })
    await user.click(screen.getByRole('button', { name: 'Previsualizar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No es una fecha válida.')
    expect(screen.queryByText(/Para generar/)).not.toBeInTheDocument()
  })

  it('cambiar el mes descarta lo previsualizado: era de otro mes y no se puede generar', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-12' } })
    expect(screen.queryByText(/Para generar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generar cuotas' })).not.toBeInTheDocument()
  })
})

describe('Generar las cuotas — las expensas y los totales', () => {
  it('🔴 cada concepto variable tiene su campo y el total de la cuota se actualiza, sumado en centavos', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)

    const fila = screen.getAllByRole('row').find((f) => within(f).queryByRole('link', { name: 'C-000005' }))!
    // Sin expensas: alquiler más ABL.
    expect(fila).toHaveTextContent('$ 458.500,25')
    await user.type(screen.getByRole('textbox', { name: 'Expensas de C-000005' }), '18.500,50')
    expect(fila).toHaveTextContent('$ 477.000,75')
    expect(screen.getByText(/2 de 2 cuotas tildadas · total \$ 642\.000,75/)).toBeInTheDocument()
  })

  it('una expensa mal escrita se avisa y no deja generar', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)
    await user.type(screen.getByRole('textbox', { name: 'Expensas de C-000005' }), 'mucho')

    expect(screen.getByRole('alert')).toHaveTextContent('Escribí el importe con hasta dos decimales, mayor que cero.')
    expect(screen.getByRole('button', { name: 'Generar cuotas' })).toBeDisabled()
  })
})

/** La previsualización de un mes con un contrato en pesos y otro en dólares, con ajuste a mitad de mes y conceptos del propietario. */
function conDolares() {
  const api = base()
  api.responder(
    'POST /api/cuotas/previsualizar',
    json({
      ...PREVISUALIZACION_DE_CUOTAS,
      propuestas: [PREVISUALIZACION_DE_CUOTAS.propuestas[0], PROPUESTA_EN_DOLARES_CON_TRAMOS],
    }),
  )
  api.responder(
    'POST /api/cuotas/generar',
    json({
      generadas: [
        CUOTA_PENDIENTE,
        { ...CUOTA_EN_DOLARES, gastos_del_propietario: [{ id: 80, descripcion: 'Seguro', importe: '40.50', anulado: false }] },
      ],
    }),
  )
  return api
}

describe('Generar las cuotas — la moneda, los tramos y lo que paga el propietario', () => {
  it('🔴 cada cuota va en la moneda de su contrato y el total de la pantalla es uno por moneda: nunca se suman pesos con dólares', async () => {
    const user = userEvent.setup()
    conDolares()
    montar()
    await previsualizar(user)

    const filas = screen.getAllByRole('row')
    const pesos = filas.find((f) => within(f).queryByRole('link', { name: 'C-000005' }))!
    expect(pesos).toHaveTextContent('$ 458.500,25')
    const dolares = filas.find((f) => within(f).queryByRole('link', { name: 'C-000009' }))!
    expect(dolares).toHaveTextContent('US$ 1.230,00')
    expect(screen.getByText(/2 de 2 cuotas tildadas · total \$ 458\.500,25 y US\$ 1\.230,00/)).toBeInTheDocument()
  })

  it('🔴 con un ajuste a mitad de mes muestra los tramos (días, importe y cuál lleva el ajuste); con un solo precio no hay lista de tramos', async () => {
    const user = userEvent.setup()
    conDolares()
    montar()
    await previsualizar(user)

    const tramos = screen.getByRole('list', { name: 'Tramos del alquiler de C-000009' })
    const items = within(tramos).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('del 01-11-2026 al 14-11-2026 (14 días): US$ 560,00')
    expect(items[1]).toHaveTextContent('del 15-11-2026 al 30-11-2026 (16 días, con el ajuste): US$ 670,00')
    expect(screen.queryByRole('list', { name: 'Tramos del alquiler de C-000005' })).not.toBeInTheDocument()
  })

  it('🔴 muestra los gastos del propietario que se cargan solos y los que hay que cargar a mano, con el enlace a /gastos; no suman a la cuota', async () => {
    const user = userEvent.setup()
    conDolares()
    montar()
    await previsualizar(user)

    const tarjeta = screen.getByText('Lo que paga el propietario').closest('[data-slot="card"]') as HTMLElement
    expect(within(tarjeta).getByText('Gastos del propietario que se cargan')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/C-000009 · Seguro: US\$ 40,50/)).toBeInTheDocument()
    expect(within(tarjeta).getByText('Para cargar como gasto cuando llegue el importe')).toBeInTheDocument()
    expect(within(tarjeta).getByText('C-000009 · Reparación del consorcio')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Gastos' })).toHaveAttribute('href', '/gastos')
    // El seguro (US$ 40,50) no entra en el total de la cuota.
    const fila = screen.getAllByRole('row').find((f) => within(f).queryByRole('link', { name: 'C-000009' }))!
    expect(fila).toHaveTextContent('US$ 1.230,00')
  })

  it('sin conceptos del propietario no hay tarjeta', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await previsualizar(user)
    expect(screen.queryByText('Lo que paga el propietario')).not.toBeInTheDocument()
  })

  it('🔴 la confirmación y lo generado también van por moneda; lo que queda para cargar como gasto se recuerda después de generar', async () => {
    const user = userEvent.setup()
    conDolares()
    montar()
    await previsualizar(user)

    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))
    expect(await screen.findByText(/Suman \$ 458\.500,25 y US\$ 1\.230,00\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))

    expect(await screen.findByText('Se generaron 2 cuotas de noviembre 2026')).toBeInTheDocument()
    const generadas = screen.getByText('Se generaron 2 cuotas de noviembre 2026').closest('[data-slot="card"]') as HTMLElement
    expect(within(generadas).getByText(/\$ 462\.500,50/)).toBeInTheDocument()
    expect(within(generadas).getByText(/US\$ 1\.200,00/)).toBeInTheDocument()
    expect(within(generadas).getByText(/cargó 1 gasto por cuenta del propietario/)).toBeInTheDocument()
    expect(within(generadas).getByText('C-000009 · Reparación del consorcio (dólares)')).toBeInTheDocument()
    expect(within(generadas).getByRole('link', { name: 'Ir a los gastos' })).toHaveAttribute('href', '/gastos')
  })
})

describe('Generar las cuotas — generar', () => {
  it('🔴 pide confirmación y manda los contratos tildados con las expensas escritas, como texto decimal; después muestra lo generado', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)
    await user.type(screen.getByRole('textbox', { name: 'Expensas de C-000005' }), '18.500,50')

    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))
    expect(await screen.findByText('¿Generar 2 cuotas de noviembre 2026?')).toBeInTheDocument()
    expect(api.de('POST', '/api/cuotas/generar')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))

    await waitFor(() => expect(api.de('POST', '/api/cuotas/generar')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/generar')[0].cuerpo).toEqual({
      ancla: '2026-11-01',
      contrato_ids: [5, 7],
      variables: { '11': '18500.50' },
    })
    expect(await screen.findByText('Se generó 1 cuota de noviembre 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'C-000005' })).toHaveAttribute('href', '/cuotas/30')
    // La previsualización se va: no se puede volver a generar con la misma.
    expect(screen.queryByText(/Para generar/)).not.toBeInTheDocument()
  })

  it('🔴 sólo viajan los contratos tildados, y las expensas dejadas vacías no viajan', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)
    await user.click(screen.getByRole('checkbox', { name: 'Generar la cuota de C-000007' }))
    expect(screen.getByText(/1 de 2 cuotas tildadas · total \$ 458\.500,25/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))
    await screen.findByText('¿Generar 1 cuota de noviembre 2026?')
    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))

    await waitFor(() => expect(api.de('POST', '/api/cuotas/generar')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/generar')[0].cuerpo).toEqual({ ancla: '2026-11-01', contrato_ids: [5], variables: {} })
  })

  it('🔴 sin ninguna tildada no se puede generar (una lista vacía de contratos el servidor la lee como «todos»)', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)
    await user.click(screen.getByRole('checkbox', { name: 'Generar la cuota de C-000005' }))
    await user.click(screen.getByRole('checkbox', { name: 'Generar la cuota de C-000007' }))

    expect(screen.getByRole('button', { name: 'Generar cuotas' })).toBeDisabled()
    expect(api.de('POST', '/api/cuotas/generar')).toHaveLength(0)
  })

  it('cancelar la confirmación no genera nada', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await previsualizar(user)
    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(api.de('POST', '/api/cuotas/generar')).toHaveLength(0)
    expect(screen.getByText(/Para generar/)).toBeInTheDocument()
  })

  it('un rechazo del servidor al generar (409) se muestra y la previsualización queda para volver a intentar', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/cuotas/generar', error(409, 'Otra generación del mismo mes terminó primero: volvé a previsualizar.'))
    montar()
    await previsualizar(user)
    await user.click(screen.getByRole('button', { name: 'Generar cuotas' }))
    await user.click(await screen.findByRole('button', { name: 'Generar cuotas' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Otra generación del mismo mes terminó primero')
    expect(screen.getByText(/Para generar/)).toBeInTheDocument()
  })
})
