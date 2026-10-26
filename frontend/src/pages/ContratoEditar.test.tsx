import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ContratoEditar } from './ContratoEditar'
import { CLIENTES, CONTRATO_BORRADOR, INDICES, CONTRATO_VIGENTE, PROPIEDAD, PROPIEDAD_ALQUILADA } from '@/test/datos'
import { json, servidor } from '@/test/servidor'

function montar(id: number) {
  return render(
    <MemoryRouter initialEntries={[`/contratos/${id}/editar`]}>
      <Routes>
        <Route path="/contratos/:id/editar" element={<ContratoEditar />} />
        <Route path="/contratos/:id" element={<p>FICHA DEL CONTRATO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Contrato — la edición', () => {
  it('🔴 un borrador se edita entero: el formulario llega con todo lo cargado, el importe y el método con sus campos', async () => {
    servidor({
      'GET /api/contratos/6': json(CONTRATO_BORRADOR),
      'GET /api/propiedades': json([PROPIEDAD, PROPIEDAD_ALQUILADA]),
      'GET /api/clientes': json(CLIENTES),
      'GET /api/contratos/ajustes/indices': json(INDICES),
    })
    montar(6)

    expect(await screen.findByRole('heading', { name: 'Editar C-000006' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Propiedad' })).toHaveValue('P-000002 · Avenida Ficticia 456'))
    expect(screen.getByRole('combobox', { name: 'Inquilino' })).toHaveValue('Carla Ficticia')
    expect(screen.getByLabelText('Fecha de inicio')).toHaveValue('2026-03-01')
    expect(screen.getByLabelText('Fecha de fin')).toHaveValue('2028-02-29')
    expect(screen.getByLabelText('Alquiler inicial')).toHaveValue('450.000,00')
    expect(screen.getByLabelText('Depósito')).toHaveValue('450.000,00')
    expect(screen.getByLabelText('Días de gracia')).toHaveValue('3')
    expect(screen.getByRole('combobox', { name: 'Método de ajuste' })).toHaveTextContent('Índice oficial')
    expect(screen.getByRole('combobox', { name: 'Índice' })).toHaveValue('Índice para Contratos de Locación (ICL, base 30-06-2020 = 1)')
    expect(screen.getByRole('combobox', { name: 'Se ajusta cada' })).toHaveTextContent('Trimestral')
    expect(screen.getByLabelText('Punitorio (tasa en %)')).toHaveValue('0,50')
    expect(screen.getByLabelText('Comisión (%)')).toHaveValue('5,00')
  })

  it('al guardar manda un PUT con el contrato entero y vuelve a la ficha', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/contratos/6': json(CONTRATO_BORRADOR),
      'GET /api/propiedades': json([PROPIEDAD, PROPIEDAD_ALQUILADA]),
      'GET /api/clientes': json(CLIENTES),
      'GET /api/contratos/ajustes/indices': json(INDICES),
      'PUT /api/contratos/6': json(CONTRATO_BORRADOR),
    })
    montar(6)
    await screen.findByRole('heading', { name: 'Editar C-000006' })

    const alquiler = screen.getByLabelText('Alquiler inicial')
    await user.clear(alquiler)
    await user.type(alquiler, '480.000')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(api.de('PUT', '/api/contratos/6')).toHaveLength(1))
    expect(api.de('PUT', '/api/contratos/6')[0].cuerpo).toMatchObject({
      propiedad_id: 2,
      inquilino_id: 3,
      importe_inicial: '480000.00',
      metodo_ajuste: 'indice',
      indice_ajuste: 'icl',
      periodicidad_ajuste: 'trimestral',
      punitorio_tasa: '0.5000',
      comision_pct: '5.00',
      deposito: '450000.00',
    })
    expect(await screen.findByText('FICHA DEL CONTRATO')).toBeInTheDocument()
  })

  it('🔴 uno vigente no se edita entero: se dice y no se ofrece el formulario', async () => {
    servidor({ 'GET /api/contratos/5': json(CONTRATO_VIGENTE) })
    montar(5)

    expect(await screen.findByText(/Un contrato vigente ya no cambia sus condiciones/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Alquiler inicial')).not.toBeInTheDocument()
  })
})
