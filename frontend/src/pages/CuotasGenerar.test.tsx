import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CuotasGenerar } from './CuotasGenerar'
import { CUOTA_PENDIENTE, PREVISUALIZACION_DE_CUOTAS } from '@/test/datos'
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
