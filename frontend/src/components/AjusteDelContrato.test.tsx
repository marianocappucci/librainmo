import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AjusteDelContrato, seAjusta } from './AjusteDelContrato'
import {
  AJUSTE_POR_INDICE, AJUSTE_POR_PORCENTAJE, AJUSTE_YA_HECHO, CONTRATO_VIGENTE, FALTA_DE_INDICE, INDICES,
} from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'

const RUTA = 'GET /api/contratos/5/ajuste'

function base(propuesta: unknown) {
  return servidor({ [RUTA]: json(propuesta), 'GET /api/contratos/ajustes/indices': json(INDICES) })
}

afterEach(() => vi.unstubAllGlobals())

describe('seAjusta: cuándo se ofrece la tarjeta', () => {
  it('🔴 sólo un contrato vigente por porcentaje o por índice', () => {
    expect(seAjusta({ estado: 'vigente', metodo_ajuste: 'indice' })).toBe(true)
    expect(seAjusta({ estado: 'vigente', metodo_ajuste: 'porcentaje' })).toBe(true)
    expect(seAjusta({ estado: 'vigente', metodo_ajuste: 'fijo' })).toBe(false)
    expect(seAjusta({ estado: 'borrador', metodo_ajuste: 'indice' })).toBe(false)
    expect(seAjusta({ estado: 'rescindido', metodo_ajuste: 'porcentaje' })).toBe(false)
  })
})

describe('Ajuste del contrato — la propuesta', () => {
  it('por índice: el importe vigente y el ajustado, la variación con signo, el coeficiente y los valores del índice', async () => {
    const api = base(AJUSTE_POR_INDICE)
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)

    expect(await screen.findByText('Alquiler ajustado')).toBeInTheDocument()
    expect(screen.getByText('Alquiler vigente').nextSibling).toHaveTextContent('$ 450.000,00')
    expect(screen.getByText('Alquiler ajustado').nextSibling).toHaveTextContent('$ 498.750,00')
    expect(screen.getByText('+10,83 %')).toBeInTheDocument()
    expect(screen.getByText('Rige desde').nextSibling).toHaveTextContent('01-09-2026')
    expect(screen.getByText(/Coeficiente 1,1083333333/)).toBeInTheDocument()
    // Los valores del índice, sin redondear (no pasan por `number`) y con la fecha pedida si no hay valor ese día.
    expect(screen.getByText('12,3456789')).toBeInTheDocument()
    expect(screen.getByText('13,68')).toBeInTheDocument()
    expect(screen.getByText('(se pidió el 01-09-2026)')).toBeInTheDocument()
    expect(screen.getAllByText('bcra')).toHaveLength(2)
    // La propuesta es de hoy: no se manda fecha.
    expect(api.de('GET', '/api/contratos/5/ajuste')[0].query.has('fecha')).toBe(false)
  })

  it('por porcentaje: cuánto se compone y cuántas veces, sin tabla de valores', async () => {
    base(AJUSTE_POR_PORCENTAJE)
    render(<AjusteDelContrato contrato={{ ...CONTRATO_VIGENTE, metodo_ajuste: 'porcentaje', indice_ajuste: null }} onAplicado={() => {}} />)

    expect(await screen.findByText('Alquiler ajustado')).toBeInTheDocument()
    expect(screen.getByText('Ajuste por porcentaje')).toBeInTheDocument()
    expect(screen.getByText(/10,00 % compuesto 1 vez \(trimestral\)\. Coeficiente 1,1\./)).toBeInTheDocument()
    expect(screen.getByText('+10,00 %')).toBeInTheDocument()
    expect(screen.queryByText('Fuente')).not.toBeInTheDocument()
  })

  it.each([
    ['ya_ajustado', 'El período en curso ya está ajustado; el próximo ajuste es el 01-12-2026.'],
    ['primer_periodo', 'Todavía no cumplió su primer período de ajuste; el próximo ajuste es el 01-12-2026.'],
  ])('«%s»: lo dice, con el próximo ajuste y el alquiler vigente, y no ofrece aplicar', async (motivo, texto) => {
    base({ ...AJUSTE_YA_HECHO, motivo })
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)

    expect(await screen.findByText(texto)).toBeInTheDocument()
    expect(screen.getByText('Alquiler vigente: $ 450.000,00 desde el 01-06-2026.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar ajuste' })).not.toBeInTheDocument()
  })

  it('🔴 si falta un valor del índice (409 con un detail objeto) dice qué fechas faltan y que se carga a mano; «Volver a consultar» lo pide otra vez', async () => {
    const user = userEvent.setup()
    const api = servidor({
      [RUTA]: json({ detail: FALTA_DE_INDICE }, 409),
      'GET /api/contratos/ajustes/indices': json(INDICES),
    })
    render(<AjusteDelContrato contrato={{ ...CONTRATO_VIGENTE, indice_ajuste: 'casa_propia' }} onAplicado={() => {}} />)

    expect(await screen.findByText('Falta el valor del índice para ajustar este contrato.')).toBeInTheDocument()
    expect(screen.getByText('Faltan los valores de Coeficiente Casa Propia de: 01-08-2026, 01-09-2026.')).toBeInTheDocument()
    expect(await screen.findByText('Este índice se carga a mano: no se baja solo de ninguna fuente.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar ajuste' })).not.toBeInTheDocument()

    api.responder(RUTA, json(AJUSTE_POR_INDICE))
    await user.click(screen.getByRole('button', { name: 'Volver a consultar' }))
    expect(await screen.findByText('Alquiler ajustado')).toBeInTheDocument()
    expect(api.de('GET', '/api/contratos/5/ajuste')).toHaveLength(2)
  })

  it('un índice que se baja solo no lleva la aclaración de «se carga a mano»', async () => {
    servidor({
      [RUTA]: json({ detail: { ...FALTA_DE_INDICE, indice: 'icl', indice_nombre: 'ICL' } }, 409),
      'GET /api/contratos/ajustes/indices': json(INDICES),
    })
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)
    expect(await screen.findByText(/Faltan los valores de ICL de/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/se carga a mano/)).not.toBeInTheDocument())
  })

  it('un 409 de texto (el contrato no tiene precio vigente) se muestra tal cual, sin botón de aplicar', async () => {
    servidor({ [RUTA]: error(409, 'El contrato no tiene un precio vigente.'), 'GET /api/contratos/ajustes/indices': json(INDICES) })
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)
    expect(await screen.findByText('El contrato no tiene un precio vigente.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aplicar ajuste' })).not.toBeInTheDocument()
  })
})

describe('Ajuste del contrato — aplicar', () => {
  it('🔴 pide confirmación y manda SÓLO la fecha del ajuste (el servidor rehace la cuenta); devuelve el contrato nuevo', async () => {
    const user = userEvent.setup()
    const api = base(AJUSTE_POR_INDICE)
    const ajustado = { ...CONTRATO_VIGENTE, importe_vigente: '498750.00', precio_vigente_desde: '2026-09-01' }
    api.responder('POST /api/contratos/5/ajuste', json({ contrato: ajustado, ajuste: AJUSTE_POR_INDICE.ajuste }, 201))
    const alAplicar = vi.fn()
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={alAplicar} />)

    await user.click(await screen.findByRole('button', { name: 'Aplicar ajuste' }))
    expect(await screen.findByText('¿Aplicar el ajuste?')).toBeInTheDocument()
    expect(screen.getByText(/pasa de \$ 450\.000,00 a \$ 498\.750,00 \(\+10,83 %\), vigente desde el 01-09-2026/)).toBeInTheDocument()
    expect(api.de('POST', '/api/contratos/5/ajuste')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    await waitFor(() => expect(api.de('POST', '/api/contratos/5/ajuste')).toHaveLength(1))
    expect(api.de('POST', '/api/contratos/5/ajuste')[0].cuerpo).toEqual({ fecha_ajuste: '2026-09-01' })
    await waitFor(() => expect(alAplicar).toHaveBeenCalledWith(ajustado))
  })

  it('cancelar la confirmación no aplica nada', async () => {
    const user = userEvent.setup()
    const api = base(AJUSTE_POR_INDICE)
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Aplicar ajuste' }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(api.de('POST', '/api/contratos/5/ajuste')).toHaveLength(0)
  })

  it('si el servidor lo rechaza al aplicar (ya se ajustó en el medio), muestra el motivo y la propuesta queda', async () => {
    const user = userEvent.setup()
    const api = base(AJUSTE_POR_INDICE)
    api.responder('POST /api/contratos/5/ajuste', error(409, 'El período de ajuste en curso ya tiene su precio.'))
    render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)
    await user.click(await screen.findByRole('button', { name: 'Aplicar ajuste' }))
    await user.click(await screen.findByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El período de ajuste en curso ya tiene su precio.')
    expect(screen.getByText('Alquiler ajustado')).toBeInTheDocument()
  })

  it('🔴 cuando cambia el precio vigente (un ajuste, o «Actualizar precio» a mano) la propuesta se vuelve a pedir: la vieja quedó vieja', async () => {
    const api = base(AJUSTE_POR_INDICE)
    const { rerender } = render(<AjusteDelContrato contrato={CONTRATO_VIGENTE} onAplicado={() => {}} />)
    await screen.findByText('Alquiler ajustado')
    expect(api.de('GET', '/api/contratos/5/ajuste')).toHaveLength(1)

    api.responder(RUTA, json(AJUSTE_YA_HECHO))
    rerender(<AjusteDelContrato contrato={{ ...CONTRATO_VIGENTE, precio_vigente_desde: '2026-09-01' }} onAplicado={() => {}} />)
    expect(await screen.findByText(/El período en curso ya está ajustado/)).toBeInTheDocument()
    expect(api.de('GET', '/api/contratos/5/ajuste')).toHaveLength(2)
  })
})

