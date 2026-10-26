import { describe, expect, it } from 'vitest'

import {
  ESTADOS_DE_CONTRATO, ESTADOS_DE_PROPIEDAD, ESTADOS_ELEGIBLES_DE_PROPIEDAD, METODOS_DE_AJUSTE, PERIODICIDADES, ROLES,
  TIPOS_DE_PROPIEDAD, CATEGORIAS_DE_GASTO, MEDIOS_DE_COBRO, MEDIOS_DE_PAGO_AL_PROPIETARIO, ESTADOS_DE_CUOTA, etiquetaDeMotivoDePrecio,
  tonoDeEstadoDeCuota, tonoDeEstadoDeLiquidacion, direccionCompleta, etiquetaDe, etiquetaDeRol, tonoDeEstadoDeContrato, tonoDeEstadoDePropiedad,
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

describe('vocabulario de cuotas, cobros y liquidaciones (app/models/)', () => {
  it('el ciclo de la cuota y su tono', () => {
    expect(ESTADOS_DE_CUOTA.map((e) => e.value)).toEqual(['pendiente', 'cobrada', 'anulada'])
    expect(tonoDeEstadoDeCuota('pendiente')).toBe('atencion')
    expect(tonoDeEstadoDeCuota('cobrada')).toBe('ok')
    expect(tonoDeEstadoDeCuota('anulada')).toBe('neutro')
    expect(tonoDeEstadoDeLiquidacion('emitida')).toBe('atencion')
    expect(tonoDeEstadoDeLiquidacion('pagada')).toBe('ok')
  })

  it('🔴 un inquilino no paga con «cuenta corriente» (el cobro es lo que salda la cuenta): los otros ocho medios del motor', () => {
    expect(MEDIOS_DE_COBRO.map((m) => m.value)).toEqual([
      'efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'mercadopago', 'cuenta_dni', 'billetera', 'cheque',
    ])
    expect(MEDIOS_DE_COBRO.map((m) => m.value)).not.toContain('cuenta_corriente')
  })

  it('al propietario se le paga con transferencia, efectivo o cheque', () => {
    expect(MEDIOS_DE_PAGO_AL_PROPIETARIO.map((m) => m.value)).toEqual(['transferencia', 'efectivo', 'cheque'])
  })

  it('las seis categorías de gasto del modelo', () => {
    expect(CATEGORIAS_DE_GASTO.map((c) => c.value)).toEqual(['reparacion', 'expensas_extraordinarias', 'impuesto', 'servicio', 'honorarios', 'otro'])
  })

  it('el motivo de un precio: los del contrato y los de un ajuste, con la clave del índice', () => {
    expect(etiquetaDeMotivoDePrecio('inicial')).toBe('Precio inicial')
    expect(etiquetaDeMotivoDePrecio('manual')).toBe('Actualización manual')
    expect(etiquetaDeMotivoDePrecio('ajuste_porcentaje')).toBe('Ajuste por porcentaje')
    expect(etiquetaDeMotivoDePrecio('ajuste_indice:icl')).toBe('Ajuste por índice (ICL)')
    expect(etiquetaDeMotivoDePrecio('otro_motivo')).toBe('otro_motivo')
  })
})
