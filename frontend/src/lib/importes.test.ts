import { describe, expect, it } from 'vitest'

import { aCentesimas, aDecimal, deCentesimas, importePositivo, numeroArgentino, pesos, porcentaje } from './importes'

describe('numeroArgentino: el texto decimal de la API, con miles y coma', () => {
  it.each([
    ['450000.00', 2, '450.000,00'],
    ['450000', 2, '450.000,00'],
    ['1234567.5', 2, '1.234.567,50'],
    ['0.00', 2, '0,00'],
    ['66.670', 2, '66,67'], // la escala de la columna (3) no se muestra si los ceros sobran
    ['0.5000', 2, '0,50'],
    ['0.0125', 2, '0,0125'], // los decimales que dicen algo se conservan
    ['999', 0, '999'],
  ])('%s con %i decimales mínimos es «%s»', (entrada, decimales, esperado) => {
    expect(numeroArgentino(entrada, decimales)).toBe(esperado)
  })

  it('lo vacío sale vacío y lo que no es un decimal sale tal cual (un dato raro no se esconde detrás de un NaN)', () => {
    expect(numeroArgentino(null)).toBe('')
    expect(numeroArgentino(undefined)).toBe('')
    expect(numeroArgentino('')).toBe('')
    expect(numeroArgentino('abc')).toBe('abc')
  })

  it('🔴 no pasa por `number`: un importe de más de 15 cifras no pierde un centavo', () => {
    // Un `Number('123456789012345.67')` ya redondea; el texto se reordena sin calcular.
    expect(numeroArgentino('123456789012345.67')).toBe('123.456.789.012.345,67')
  })
})

describe('pesos y porcentaje', () => {
  it('pesos lleva el símbolo, un espacio fijo y el formato argentino', () => {
    expect(pesos('450000.00')).toBe('$ 450.000,00')
    expect(pesos('1200.5', 'USD')).toBe('US$ 1.200,50')
    expect(pesos(null)).toBe('')
  })

  it('porcentaje lleva el signo después del número', () => {
    expect(porcentaje('66.67')).toBe('66,67 %')
    expect(porcentaje('5.000')).toBe('5,00 %')
    expect(porcentaje(null)).toBe('')
  })
})

describe('aDecimal: lo que se escribe, como texto decimal con la escala de la columna', () => {
  it.each([
    ['450000', '450000.00'],
    ['450000,5', '450000.50'],
    ['450.000,50', '450000.50'], // la forma argentina
    ['450.000', '450000.00'], // puntos de miles
    ['1.234.567', '1234567.00'],
    ['450000.50', '450000.50'], // el punto decimal también
    ['1234.5', '1234.50'],
    ['$ 450.000,00', '450000.00'],
    ['0,5', '0.50'],
    ['007', '7.00'],
  ])('«%s» → %s', (entrada, esperado) => {
    expect(aDecimal(entrada, 2)).toBe(esperado)
  })

  it.each(['', '  ', 'abc', '12,3,4', '1,234.5,6', '-5', '12,345', '1e5', ',5'])('«%s» no es un importe', (entrada) => {
    expect(aDecimal(entrada, 2)).toBeNull()
  })

  it('con más decimales de los que admite la columna, no es válido (no se redondea en silencio)', () => {
    expect(aDecimal('10,005', 2)).toBeNull()
    expect(aDecimal('10,005', 3)).toBe('10.005')
    // Los ceros que sobran no cuentan.
    expect(aDecimal('10,500', 2)).toBe('10.50')
  })

  it('sin `miles` el punto solo es siempre el decimal (los porcentajes no llegan a mil)', () => {
    expect(aDecimal('1.500', 3, { miles: false })).toBe('1.500')
    expect(aDecimal('1.500', 2)).toBe('1500.00')
    expect(aDecimal('12.5', 2, { miles: false })).toBe('12.50')
  })

  it('`enteros` topa lo que entra en la columna', () => {
    expect(aDecimal('1000', 2, { enteros: 3 })).toBeNull()
    expect(aDecimal('999', 2, { enteros: 3 })).toBe('999.00')
  })
})

describe('importePositivo', () => {
  it('acepta un importe mayor que cero y rechaza cero, lo vacío y lo que no entra en Numeric(14, 2)', () => {
    expect(importePositivo('500.000,00')).toBe('500000.00')
    expect(importePositivo('0,00')).toBeNull()
    expect(importePositivo('')).toBeNull()
    expect(importePositivo('1234567890123')).toBeNull() // 13 enteros
  })
})

describe('centésimas: sumar porcentajes sin `float`', () => {
  it('pasa de decimal a entero y vuelve', () => {
    expect(aCentesimas('66.67')).toBe(6667)
    expect(aCentesimas('100')).toBe(10000)
    expect(aCentesimas('5.5')).toBe(550)
    expect(aCentesimas('1.234')).toBeNull() // tres decimales: no es un porcentaje de la columna
    expect(deCentesimas(10000)).toBe('100.00')
    expect(deCentesimas(6667)).toBe('66.67')
    expect(deCentesimas(5)).toBe('0.05')
  })

  it('🔴 con `float` 10,10 + 20,20 no da 30,30; en centésimas, sí', () => {
    expect(10.1 + 20.2 === 30.3).toBe(false)
    const suma = ['10.10', '20.20'].reduce((total, p) => total + (aCentesimas(p) ?? 0), 0)
    expect(suma).toBe(aCentesimas('30.30'))
  })
})
