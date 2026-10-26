import { describe, expect, it } from 'vitest'

import { CIEN_POR_CIENTO, validarTitulares } from './titulares'

describe('validarTitulares: la lista que se manda y por qué todavía no se puede', () => {
  it('dos titulares que suman 100: sin problema, y la lista entera con los porcentajes como texto decimal', () => {
    const r = validarTitulares([
      { cliente_id: '1', porcentaje: '60' },
      { cliente_id: '2', porcentaje: '40,00' },
    ])
    expect(r.problema).toBeNull()
    expect(r.total).toBe(CIEN_POR_CIENTO)
    expect(r.titulares).toEqual([
      { cliente_id: 1, porcentaje: '60.00' },
      { cliente_id: 2, porcentaje: '40.00' },
    ])
  })

  it('🔴 tres tercios (33,33 + 33,33 + 33,34) suman 100 exacto', () => {
    const r = validarTitulares([
      { cliente_id: '1', porcentaje: '33,33' },
      { cliente_id: '2', porcentaje: '33,33' },
      { cliente_id: '3', porcentaje: '33,34' },
    ])
    expect(r.problema).toBeNull()
  })

  it('si no suman 100, lo dice con el total que da', () => {
    const r = validarTitulares([
      { cliente_id: '1', porcentaje: '60' },
      { cliente_id: '2', porcentaje: '30' },
    ])
    expect(r.problema).toBe('Los porcentajes suman 90,00\u00a0% y tienen que sumar 100 %.')
    expect(r.total).toBe(9000)
  })

  it('una lista vacía no es válida', () => {
    expect(validarTitulares([]).problema).toBe('La propiedad tiene que tener al menos un titular.')
  })

  it.each([
    [[{ cliente_id: '', porcentaje: '100' }], 'Elegí el titular de la fila 1.'],
    [[{ cliente_id: '1', porcentaje: '' }], 'Escribí el porcentaje de la fila 1 (hasta dos decimales).'],
    [[{ cliente_id: '1', porcentaje: '33,333' }], 'Escribí el porcentaje de la fila 1 (hasta dos decimales).'],
    [[{ cliente_id: '1', porcentaje: '0' }], 'El porcentaje de la fila 1 tiene que ser mayor que 0 y no pasar de 100.'],
    [[{ cliente_id: '1', porcentaje: '101' }], 'El porcentaje de la fila 1 tiene que ser mayor que 0 y no pasar de 100.'],
    [
      [
        { cliente_id: '1', porcentaje: '50' },
        { cliente_id: '1', porcentaje: '50' },
      ],
      'Un titular aparece dos veces.',
    ],
  ])('%j → «%s»', (filas, problema) => {
    expect(validarTitulares(filas).problema).toBe(problema)
  })
})
