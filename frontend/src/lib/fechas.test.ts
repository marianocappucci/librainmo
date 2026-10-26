import { describe, expect, it } from 'vitest'

import { aDatetimeLocal, desdeDatetimeLocal, diaISO, fecha, fechaHora, hora, hoyISO } from './fechas'

describe('fecha: dd-mm-aaaa', () => {
  it('reordena un día del calendario sin pasar por un Date (no se corre un día por la zona)', () => {
    expect(fecha('1980-05-17')).toBe('17-05-1980')
    expect(fecha('2026-01-01')).toBe('01-01-2026')
  })

  it('un instante se muestra en hora de Argentina, con guiones', () => {
    // 01:30 UTC del 2 es todavía el 1 a las 22:30 en Argentina.
    expect(fecha('2026-10-02T01:30:00Z')).toBe('01-10-2026')
    expect(fecha('2026-10-01T22:30:00-03:00')).toBe('01-10-2026')
  })

  it('lo vacío o inválido es cadena vacía', () => {
    expect(fecha(null)).toBe('')
    expect(fecha(undefined)).toBe('')
    expect(fecha('')).toBe('')
    expect(fecha('no es una fecha')).toBe('')
  })
})

describe('fechaHora y hora: reloj de 24 h en Argentina', () => {
  it('dd-mm-aaaa HH:MM', () => {
    expect(fechaHora('2026-10-27T09:30:00-03:00')).toBe('27-10-2026 09:30')
    expect(fechaHora('2026-10-27T12:30:00Z')).toBe('27-10-2026 09:30')
    expect(hora('2026-10-27T21:05:00-03:00')).toBe('21:05')
  })

  it('la medianoche es 00:xx, no 24:xx', () => {
    expect(hora('2026-10-27T00:05:00-03:00')).toBe('00:05')
    expect(fechaHora('2026-10-27T03:05:00Z')).toBe('27-10-2026 00:05')
  })

  it('vacío es vacío', () => {
    expect(fechaHora(null)).toBe('')
    expect(hora('basura')).toBe('')
  })
})

describe('diaISO y hoyISO: el día de la inmobiliaria, no el de UTC', () => {
  it('a las 22:00 de Argentina sigue siendo el mismo día', () => {
    expect(diaISO('2026-10-02T01:00:00Z')).toBe('2026-10-01')
  })

  it('hoy es un aaaa-mm-dd', () => {
    expect(hoyISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('datetime-local ↔ API', () => {
  it('de la API al campo: en hora de Argentina y sin segundos', () => {
    expect(aDatetimeLocal('2026-10-27T09:30:00-03:00')).toBe('2026-10-27T09:30')
    expect(aDatetimeLocal('2026-10-27T12:30:00Z')).toBe('2026-10-27T09:30')
    expect(aDatetimeLocal(null)).toBe('')
  })

  it('del campo a la API: sin zona (el backend la toma como hora argentina) y con segundos', () => {
    expect(desdeDatetimeLocal('2026-10-27T09:30')).toBe('2026-10-27T09:30:00')
    expect(desdeDatetimeLocal('2026-10-27T09:30:15')).toBe('2026-10-27T09:30:15')
  })

  it('es ida y vuelta', () => {
    expect(aDatetimeLocal(`${desdeDatetimeLocal('2026-10-27T09:30')}-03:00`)).toBe('2026-10-27T09:30')
  })
})
