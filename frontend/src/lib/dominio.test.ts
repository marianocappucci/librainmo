import { describe, expect, it } from 'vitest'

import {
  ESTADOS_DE_CONTRATO, ESTADOS_DE_PROPIEDAD, ESTADOS_ELEGIBLES_DE_PROPIEDAD, INDICES_DE_AJUSTE, METODOS_DE_AJUSTE, PERIODICIDADES, ROLES,
  TIPOS_DE_PROPIEDAD, direccionCompleta, etiquetaDe, etiquetaDeRol, tonoDeEstadoDeContrato, tonoDeEstadoDePropiedad,
} from './dominio'

describe('roles: la matriz de app/roles.py', () => {
  it('los dos roles del personal de la inmobiliaria, con etiqueta legible y en el orden de la matriz', () => {
    expect(ROLES.map((r) => `${r.value}=${r.label}`)).toEqual(['admin=Administrador', 'operador=Operador'])
  })

  it('la etiqueta de un rol; lo desconocido sale tal cual y sin rol sale vacío', () => {
    expect(etiquetaDeRol('operador')).toBe('Operador')
    expect(etiquetaDeRol('otro')).toBe('otro')
    expect(etiquetaDeRol(undefined)).toBe('')
  })
})

describe('vocabulario inmobiliario: los códigos del backend (app/models/)', () => {
  it('los tipos y los estados de la propiedad, en el orden del modelo', () => {
    expect(TIPOS_DE_PROPIEDAD.map((t) => t.value)).toEqual(['departamento', 'casa', 'ph', 'local', 'oficina', 'cochera', 'terreno', 'galpon', 'otro'])
    expect(ESTADOS_DE_PROPIEDAD.map((e) => e.value)).toEqual(['disponible', 'alquilada', 'en_venta', 'reservada', 'vendida', 'baja'])
  })

  it('🔴 «alquilada» no se elige a mano: la pone el contrato (ADR-004, punto 3)', () => {
    expect(ESTADOS_ELEGIBLES_DE_PROPIEDAD.map((e) => e.value)).toEqual(['disponible', 'en_venta', 'reservada', 'vendida', 'baja'])
  })

  it('el ciclo del contrato y los métodos de ajuste', () => {
    expect(ESTADOS_DE_CONTRATO.map((e) => e.value)).toEqual(['borrador', 'vigente', 'rescindido', 'finalizado'])
    expect(METODOS_DE_AJUSTE.map((m) => m.value)).toEqual(['fijo', 'porcentaje', 'indice'])
    expect(PERIODICIDADES.map((p) => p.value)).toEqual(['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'])
  })

  it('los siete índices del catálogo del motor, con las claves y los nombres de libracore.indices_ajuste', () => {
    expect(INDICES_DE_AJUSTE.map((i) => `${i.value}=${i.label}`)).toEqual([
      'icl=ICL (BCRA)',
      'ipc=IPC nivel (INDEC)',
      'ipc_variacion=IPC, variación mensual',
      'cer=CER',
      'uva=UVA',
      'dolar_a3500=Dólar A 3500',
      'casa_propia=Casa Propia',
    ])
  })

  it('etiquetaDe: lo desconocido sale tal cual y lo vacío sale vacío', () => {
    expect(etiquetaDe(ESTADOS_DE_CONTRATO, 'vigente')).toBe('Vigente')
    expect(etiquetaDe(ESTADOS_DE_CONTRATO, 'nuevo_estado')).toBe('nuevo_estado')
    expect(etiquetaDe(ESTADOS_DE_CONTRATO, null)).toBe('')
  })

  it('el tono de cada estado', () => {
    expect(tonoDeEstadoDeContrato('vigente')).toBe('ok')
    expect(tonoDeEstadoDeContrato('rescindido')).toBe('negativo')
    expect(tonoDeEstadoDeContrato('borrador')).toBe('neutro')
    expect(tonoDeEstadoDePropiedad('disponible')).toBe('ok')
    expect(tonoDeEstadoDePropiedad('alquilada')).toBe('curso')
    expect(tonoDeEstadoDePropiedad('baja')).toBe('neutro')
  })

  it('la dirección lleva la unidad si la tiene', () => {
    expect(direccionCompleta({ direccion: 'Calle Inventada 123', unidad: '4° B' })).toBe('Calle Inventada 123 · 4° B')
    expect(direccionCompleta({ direccion: 'Calle Inventada 123', unidad: null })).toBe('Calle Inventada 123')
  })
})
