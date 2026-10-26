/**
 * Datos de prueba de las pantallas de propiedades y contratos: la forma exacta que contesta la API (`app/servicios/`), con los importes
 * y los porcentajes como TEXTO decimal.
 *
 * 🔴 Todo es ficticio: nombres, CUIT, direcciones. Nunca personas ni empresas reales (`CONVENTIONS.md`).
 */
import type { ConceptoDelContrato, Contrato, ContratoDetalle, Propiedad } from '@/lib/api'

export const ANA = { id: 1, name: 'Ana Inventada', cuit_dni: '27000000011', activo: 1 }
export const BETO = { id: 2, name: 'Beto Ejemplo', cuit_dni: '20000000022', activo: 1 }
export const CARLA = { id: 3, name: 'Carla Ficticia', cuit_dni: '27000000033', activo: 1 }
export const DARIO_INACTIVO = { id: 4, name: 'Darío Dadodebaja', cuit_dni: '20000000044', activo: 0 }
export const CLIENTES = [ANA, BETO, CARLA, DARIO_INACTIVO]

export const PROPIEDAD: Propiedad = {
  id: 1,
  codigo: 'P-000001',
  tipo: 'departamento',
  direccion: 'Calle Inventada 123',
  unidad: '4° B',
  localidad: 'Villa Ejemplo',
  partida_abl: '123-456',
  partida_arba: null,
  estado: 'disponible',
  observaciones: 'Balcón al frente.',
  titulares: [
    { cliente_id: 1, nombre: 'Ana Inventada', porcentaje: '60.00' },
    { cliente_id: 2, nombre: 'Beto Ejemplo', porcentaje: '40.00' },
  ],
  titulares_completos: true,
  contrato_vigente: null,
}

export const PROPIEDAD_ALQUILADA: Propiedad = {
  ...PROPIEDAD,
  id: 2,
  codigo: 'P-000002',
  direccion: 'Avenida Ficticia 456',
  unidad: null,
  estado: 'alquilada',
  contrato_vigente: { id: 5, numero: 'C-000005' },
}

export const PROPIEDAD_SIN_TITULARES: Propiedad = {
  ...PROPIEDAD,
  id: 3,
  codigo: 'P-000003',
  direccion: 'Pasaje Imaginario 7',
  unidad: null,
  titulares: [],
  titulares_completos: false,
}

export const PROPIEDAD_VENDIDA: Propiedad = { ...PROPIEDAD, id: 4, codigo: 'P-000004', direccion: 'Ruta Supuesta km 9', unidad: null, estado: 'vendida' }

export const CONTRATO: Contrato = {
  id: 5,
  numero: 'C-000005',
  estado: 'vigente',
  propiedad_id: 2,
  propiedad_codigo: 'P-000002',
  propiedad_direccion: 'Avenida Ficticia 456',
  inquilino_id: 3,
  inquilino_nombre: 'Carla Ficticia',
  fecha_inicio: '2026-03-01',
  fecha_fin: '2028-02-29',
  fecha_rescision: null,
  moneda: 'ARS',
  dia_vencimiento: 10,
  dias_gracia: 3,
  metodo_ajuste: 'indice',
  indice_ajuste: 'icl',
  indice_ajuste_nombre: 'Índice para Contratos de Locación (ICL, base 30-06-2020 = 1)',
  porcentaje_ajuste: null,
  periodicidad_ajuste: 'trimestral',
  punitorio_tasa: '0.5000',
  punitorio_base: 'diaria',
  punitorio_para: 'inmobiliaria',
  comision_pct: '5.00',
  deposito: '450000.00',
  observaciones: 'Mascota permitida.',
  importe_vigente: '450000.00',
  precio_vigente_desde: '2026-03-01',
}

export const CONCEPTO_EXPENSAS: ConceptoDelContrato = {
  id: 11,
  concepto: 'expensas',
  descripcion: 'Ordinarias',
  paga: 'inquilino',
  importe: null,
  activo: true,
}

export const CONCEPTO_SEGURO: ConceptoDelContrato = {
  id: 12,
  concepto: 'seguro',
  descripcion: '',
  paga: 'propietario',
  importe: '12500.50',
  activo: true,
}

export const CONTRATO_VIGENTE: ContratoDetalle = {
  ...CONTRATO,
  precio_vigente_desde: '2026-06-01',
  precios: [
    { id: 2, vigencia_desde: '2026-06-01', vigencia_hasta: null, importe: '450000.00', motivo: 'manual', usuario: 'operador1' },
    { id: 1, vigencia_desde: '2026-03-01', vigencia_hasta: '2026-05-31', importe: '400000.00', motivo: 'inicial', usuario: 'operador1' },
  ],
  garantias: [{ id: 21, tipo: 'propietaria', garante_id: 2, garante_nombre: 'Beto Ejemplo', descripcion: 'Casa en Villa Ejemplo', vence: '2028-02-29' }],
  conceptos: [CONCEPTO_EXPENSAS, CONCEPTO_SEGURO],
}

export const CONTRATO_BORRADOR: ContratoDetalle = {
  ...CONTRATO_VIGENTE,
  id: 6,
  numero: 'C-000006',
  estado: 'borrador',
  precio_vigente_desde: '2026-03-01',
  importe_vigente: '450000.00',
  precios: [{ id: 3, vigencia_desde: '2026-03-01', vigencia_hasta: null, importe: '450000.00', motivo: 'inicial', usuario: 'operador1' }],
}

export const CONTRATO_RESCINDIDO: ContratoDetalle = {
  ...CONTRATO_VIGENTE,
  id: 7,
  numero: 'C-000007',
  estado: 'rescindido',
  fecha_rescision: '2026-09-15',
}

export const CONTRATO_FINALIZADO: ContratoDetalle = { ...CONTRATO_VIGENTE, id: 8, numero: 'C-000008', estado: 'finalizado' }

/** Lo que `GET /api/contratos` devuelve por fila: el detalle sin `precios`, `garantias` ni `conceptos`. */
export function resumen(c: ContratoDetalle): Contrato {
  const { precios: _precios, garantias: _garantias, conceptos: _conceptos, ...fila } = c
  return fila
}
