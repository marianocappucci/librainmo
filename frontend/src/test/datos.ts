/**
 * Datos de prueba de las pantallas de propiedades y contratos: la forma exacta que contesta la API (`app/servicios/`), con los importes
 * y los porcentajes como TEXTO decimal.
 *
 * 🔴 Todo es ficticio: nombres, CUIT, direcciones. Nunca personas ni empresas reales (`CONVENTIONS.md`).
 */
import type {
  Cobro, ConceptoDelContrato, Contrato, ContratoDetalle, Cuota, FondosDeTerceros, Gasto, IndiceDeAjuste, Liquidacion,
  PrevisualizacionDeCuotas, PrevisualizacionDeLiquidacion, PropuestaDeAjuste, PropuestaDeCobro, PropuestaDeCuota, Propiedad,
} from '@/lib/api'

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

/** Un contrato en dólares: sus importes se imprimen con `US$`. */
export const CONTRATO_EN_DOLARES: Contrato = {
  ...CONTRATO,
  id: 9,
  numero: 'C-000009',
  moneda: 'USD',
  deposito: '1200.00',
  importe_vigente: '1200.00',
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

/** `GET /api/contratos/ajustes/indices`: el catálogo de `libracore.indices_ajuste.INDICES`, con sus nombres de verdad. */
export const INDICES: IndiceDeAjuste[] = [
  { clave: 'icl', nombre: 'Índice para Contratos de Locación (ICL, base 30-06-2020 = 1)', periodicidad: 'diaria', se_baja_solo: true },
  { clave: 'ipc', nombre: 'IPC nivel general nacional (INDEC, base diciembre 2016)', periodicidad: 'mensual', se_baja_solo: true },
  { clave: 'ipc_variacion', nombre: 'Inflación mensual (variación % del IPC)', periodicidad: 'mensual', se_baja_solo: true },
  { clave: 'cer', nombre: 'Coeficiente de Estabilización de Referencia (CER, base 02-02-2002 = 1)', periodicidad: 'diaria', se_baja_solo: true },
  { clave: 'uva', nombre: 'Unidad de Valor Adquisitivo (UVA)', periodicidad: 'diaria', se_baja_solo: true },
  { clave: 'dolar_a3500', nombre: 'Tipo de cambio mayorista de referencia (Comunicación A 3500)', periodicidad: 'diaria', se_baja_solo: true },
  { clave: 'casa_propia', nombre: 'Coeficiente Casa Propia', periodicidad: 'mensual', se_baja_solo: false },
]

// ── Ajuste del alquiler (`GET /api/contratos/{id}/ajuste`) ──────────────

export const AJUSTE_POR_INDICE: PropuestaDeAjuste = {
  corresponde: true,
  motivo: null,
  fecha_ajuste: '2026-09-01',
  proximo_ajuste: '2026-12-01',
  precio_vigente: '450000.00',
  precio_vigente_desde: '2026-06-01',
  ajuste: {
    metodo: 'indice',
    importe_anterior: '450000.00',
    importe_nuevo: '498750.00',
    coeficiente: '1.1083333333',
    variacion_pct: '10.83',
    indice: 'icl',
    indice_nombre: 'Índice para Contratos de Locación (ICL, base 30-06-2020 = 1)',
    valores: [
      { fecha: '2026-06-01', valor: '12.3456789', fuente: 'bcra' },
      { fecha: '2026-08-29', valor: '13.68', fuente: 'bcra', fecha_pedida: '2026-09-01' },
    ],
  },
}

export const AJUSTE_POR_PORCENTAJE: PropuestaDeAjuste = {
  ...AJUSTE_POR_INDICE,
  ajuste: {
    metodo: 'porcentaje',
    importe_anterior: '450000.00',
    importe_nuevo: '495000.00',
    coeficiente: '1.1',
    variacion_pct: '10.00',
    porcentaje: '10.000',
    periodos: 1,
  },
}

export const AJUSTE_YA_HECHO: PropuestaDeAjuste = {
  ...AJUSTE_POR_INDICE,
  corresponde: false,
  motivo: 'ya_ajustado',
  ajuste: null,
}

/** El `detail` de «falta un valor del índice»: un objeto, no un texto. */
export const FALTA_DE_INDICE = {
  mensaje: 'Falta el valor del índice para ajustar este contrato.',
  indice: 'casa_propia',
  indice_nombre: 'Coeficiente Casa Propia',
  fechas_faltantes: ['2026-08-01', '2026-09-01'],
}

// ── Cuotas, cobros, gastos, liquidaciones y fondos de terceros ──────────

export const CUOTA_PENDIENTE: Cuota = {
  id: 30,
  moneda: 'ARS',
  contrato_id: 5,
  numero_contrato: 'C-000005',
  inquilino_id: 3,
  inquilino_nombre: 'Carla Ficticia',
  periodo_desde: '2026-11-01',
  periodo_hasta: '2026-11-30',
  fecha_emision: '2026-11-01',
  fecha_vencimiento: '2026-11-10',
  prorrateada: false,
  dias_cubiertos: 30,
  dias_del_periodo: 30,
  total: '462500.50',
  estado: 'pendiente',
  gastos_del_propietario: [],
  lineas: [
    { id: 1, tipo: 'alquiler', concepto_id: null, descripcion: 'Alquiler noviembre 2026', importe: '450000.00' },
    { id: 2, tipo: 'concepto', concepto_id: 13, descripcion: 'ABL', importe: '12500.50' },
  ],
}

export const CUOTA_COBRADA: Cuota = { ...CUOTA_PENDIENTE, id: 31, periodo_desde: '2026-10-01', periodo_hasta: '2026-10-31', estado: 'cobrada' }
export const CUOTA_ANULADA: Cuota = { ...CUOTA_PENDIENTE, id: 32, periodo_desde: '2026-09-01', periodo_hasta: '2026-09-30', estado: 'anulada' }

/** Una cuota de un contrato en dólares: sus importes se imprimen con `US$`. */
export const CUOTA_EN_DOLARES: Cuota = {
  ...CUOTA_PENDIENTE,
  id: 33,
  moneda: 'USD',
  total: '1200.00',
  lineas: [{ id: 5, tipo: 'alquiler', concepto_id: null, descripcion: 'Alquiler noviembre 2026', importe: '1200.00' }],
}

/** Una cuota con un concepto que paga el propietario (el seguro): se cargó sola como gasto por su cuenta, y el segundo está anulado. */
export const CUOTA_CON_GASTOS_DEL_PROPIETARIO: Cuota = {
  ...CUOTA_PENDIENTE,
  id: 34,
  gastos_del_propietario: [
    { id: 70, descripcion: 'Seguro', importe: '12500.50', anulado: false },
    { id: 71, descripcion: 'Seguro anterior', importe: '9000.00', anulado: true },
  ],
}

/** Los conceptos del contrato que paga el inquilino: las expensas (variables) y el ABL (fijo, ya en la cuota). */
export const CONCEPTOS_DEL_INQUILINO: ConceptoDelContrato[] = [
  { id: 11, concepto: 'expensas', descripcion: 'Ordinarias', paga: 'inquilino', importe: null, activo: true },
  { id: 13, concepto: 'abl', descripcion: '', paga: 'inquilino', importe: '12500.50', activo: true },
  CONCEPTO_SEGURO,
]

export const PREVISUALIZACION_DE_CUOTAS: PrevisualizacionDeCuotas = {
  periodo_desde: '2026-11-01',
  periodo_hasta: '2026-11-30',
  propuestas: [
    {
      contrato_id: 5,
      numero: 'C-000005',
      bloqueada: null,
      moneda: 'ARS',
      precio_id: 2,
      periodo_desde: '2026-11-01',
      periodo_hasta: '2026-11-30',
      fecha_emision: '2026-11-01',
      fecha_vencimiento: '2026-11-10',
      prorrateada: false,
      dias_cubiertos: 30,
      dias_del_periodo: 30,
      alquiler: '450000.00',
      tramos: [{ precio_id: 2, desde: '2026-11-01', hasta: '2026-11-30', dias: 30, importe: '450000.00', ajuste: false }],
      conceptos: [{ concepto_id: 13, descripcion: 'ABL', importe: '8500.25' }],
      variables: [{ concepto_id: 11, descripcion: 'Expensas' }],
      gastos_del_propietario: [],
      a_cargar_como_gasto: [],
    },
    {
      contrato_id: 7,
      numero: 'C-000007',
      bloqueada: null,
      moneda: 'ARS',
      precio_id: 5,
      periodo_desde: '2026-11-20',
      periodo_hasta: '2026-11-30',
      fecha_emision: '2026-11-20',
      fecha_vencimiento: '2026-11-20',
      prorrateada: true,
      dias_cubiertos: 11,
      dias_del_periodo: 30,
      alquiler: '165000.00',
      tramos: [{ precio_id: 5, desde: '2026-11-20', hasta: '2026-11-30', dias: 11, importe: '165000.00', ajuste: false }],
      conceptos: [],
      variables: [],
      gastos_del_propietario: [],
      a_cargar_como_gasto: [],
    },
  ],
  ya_generadas: [{ contrato_id: 8, numero: 'C-000008', cuota_id: 31 }],
  bloqueadas: [{ contrato_id: 9, numero: 'C-000009', motivo: 'Tiene el ajuste del 01-11-2026 pendiente: aplicalo primero.' }],
}

/** Un contrato en dólares con un ajuste a mitad de mes (dos tramos de precio) y dos conceptos que paga el propietario. */
export const PROPUESTA_EN_DOLARES_CON_TRAMOS: PropuestaDeCuota = {
  contrato_id: 9,
  numero: 'C-000009',
  bloqueada: null,
  moneda: 'USD',
  precio_id: 8,
  periodo_desde: '2026-11-01',
  periodo_hasta: '2026-11-30',
  fecha_emision: '2026-11-01',
  fecha_vencimiento: '2026-11-10',
  prorrateada: false,
  dias_cubiertos: 30,
  dias_del_periodo: 30,
  alquiler: '1230.00',
  tramos: [
    { precio_id: 7, desde: '2026-11-01', hasta: '2026-11-14', dias: 14, importe: '560.00', ajuste: false },
    { precio_id: 8, desde: '2026-11-15', hasta: '2026-11-30', dias: 16, importe: '670.00', ajuste: true },
  ],
  conceptos: [],
  variables: [],
  gastos_del_propietario: [{ concepto_id: 12, descripcion: 'Seguro', importe: '40.50' }],
  a_cargar_como_gasto: [{ concepto_id: 14, descripcion: 'Reparación del consorcio' }],
}

export const COBRO_EN_TERMINO: PropuestaDeCobro = {
  cuota_id: 30,
  fecha: '2026-11-08',
  importe_cuota: '462500.50',
  punitorio: '0.00',
  dias_de_atraso: 0,
  vencimiento: '2026-11-10',
  vencimiento_efectivo: '2026-11-10',
  total: '462500.50',
  punitorio_para: 'inmobiliaria',
}

export const COBRO_CON_PUNITORIO: PropuestaDeCobro = {
  ...COBRO_EN_TERMINO,
  fecha: '2026-11-14',
  punitorio: '9250.01',
  dias_de_atraso: 4,
  total: '471750.51',
}

export const COBRO: Cobro = {
  id: 40,
  moneda: 'ARS',
  cuota_id: 30,
  periodo_desde: '2026-11-01',
  contrato_id: 5,
  numero_contrato: 'C-000005',
  inquilino_id: 3,
  inquilino_nombre: 'Carla Ficticia',
  fecha: '2026-11-14',
  importe_cuota: '462500.50',
  punitorio: '9250.01',
  punitorio_condonado: '0.00',
  dias_de_atraso: 4,
  total: '471750.51',
  medios: [
    { medio_pago: 'efectivo', referencia: null, monto: '400000.00' },
    { medio_pago: 'transferencia', referencia: 'OP-998877', monto: '71750.51' },
  ],
  anulado: false,
  motivo_anulacion: null,
  usuario: 'operador1',
  recibo: { id: 77, numero: '00000012', punto_venta: 1, concepto: 'Alquiler noviembre 2026, Avenida Ficticia 456 (C-000005)', anulado: false },
  imputaciones: [
    { propietario_id: 1, propietario_nombre: 'Ana Inventada', tipo: 'alquiler', importe: '270000.00' },
    { propietario_id: 1, propietario_nombre: 'Ana Inventada', tipo: 'concepto', importe: '5100.15' },
    { propietario_id: 2, propietario_nombre: 'Beto Ejemplo', tipo: 'alquiler', importe: '180000.00' },
    { propietario_id: 2, propietario_nombre: 'Beto Ejemplo', tipo: 'concepto', importe: '3400.10' },
  ],
}

/** Un cobro de una cuota en dólares: la moneda del cobro es la del contrato. */
export const COBRO_EN_DOLARES: Cobro = { ...COBRO, id: 44, moneda: 'USD' }

export const COBRO_ANULADO: Cobro = { ...COBRO, id: 41, anulado: true, motivo_anulacion: 'Se cobró dos veces (operador1)', recibo: { ...COBRO.recibo!, anulado: true } }

export const GASTO: Gasto = {
  id: 50,
  propiedad_id: 1,
  propiedad_codigo: 'P-000001',
  propiedad_direccion: 'Calle Inventada 123 4° B',
  fecha: '2026-10-20',
  categoria: 'reparacion',
  descripcion: 'Cambio de la bomba de agua',
  importe: '85000.00',
  moneda: 'ARS',
  comprobante: 'A-0001-123',
  anulado: false,
  usuario: 'operador1',
  cuota_id: null,
  concepto_id: null,
  imputaciones: [
    { propietario_id: 1, propietario_nombre: 'Ana Inventada', importe: '51000.00' },
    { propietario_id: 2, propietario_nombre: 'Beto Ejemplo', importe: '34000.00' },
  ],
}

export const GASTO_ANULADO: Gasto = { ...GASTO, id: 51, descripcion: 'Pintura del palier', anulado: true }

/** Un gasto nacido de una cuota (un concepto que paga el propietario): se anula con la cuota, no suelto. */
export const GASTO_DE_CUOTA: Gasto = { ...GASTO, id: 52, descripcion: 'Seguro', importe: '12500.50', cuota_id: 30, concepto_id: 12, imputaciones: [] }

/** Un gasto en dólares. */
export const GASTO_EN_DOLARES: Gasto = { ...GASTO, id: 53, descripcion: 'Cambio del termotanque', importe: '300.00', moneda: 'USD' }

export const ITEMS_DE_LIQUIDACION = [
  {
    asiento_id: 101,
    tipo: 'cobro' as const,
    fecha: '2026-11-14',
    descripcion: 'Alquiler noviembre 2026 C-000005 (cobrado el 14-11-2026)',
    importe: '270000.00',
    base_comision: '270000.00',
    comision_pct: '5.00',
    comision: '13500.00',
  },
  {
    asiento_id: 102,
    tipo: 'gasto' as const,
    fecha: '2026-10-20',
    descripcion: 'Gasto: Cambio de la bomba de agua',
    importe: '-51000.00',
    base_comision: '0.00',
    comision_pct: '0.00',
    comision: '0.00',
  },
]

export const PREVISUALIZACION_DE_LIQUIDACION: PrevisualizacionDeLiquidacion = {
  propietario_id: 1,
  propietario_nombre: 'Ana Inventada',
  hasta: '2026-11-15',
  moneda: 'ARS',
  monedas_con_pendientes: ['ARS'],
  items: ITEMS_DE_LIQUIDACION,
  cobrado: '270000.00',
  gastos: '51000.00',
  comision: '13500.00',
  neto: '205500.00',
}

export const LIQUIDACION: Liquidacion = {
  id: 60,
  numero: 'L-000001',
  propietario_id: 1,
  propietario_nombre: 'Ana Inventada',
  fecha: '2026-11-15',
  hasta: '2026-11-15',
  moneda: 'ARS',
  cobrado: '270000.00',
  gastos: '51000.00',
  comision: '13500.00',
  neto: '205500.00',
  estado: 'emitida',
  fecha_pago: null,
  medio_pago: null,
  referencia_pago: null,
  observaciones: null,
  usuario: 'operador1',
  items: ITEMS_DE_LIQUIDACION,
}

export const LIQUIDACION_PAGADA: Liquidacion = {
  ...LIQUIDACION,
  id: 61,
  numero: 'L-000002',
  estado: 'pagada',
  fecha_pago: '2026-11-16',
  medio_pago: 'transferencia',
  referencia_pago: 'TR-5544',
}

/** Una liquidación en dólares (la del mismo propietario, aparte de la de pesos). */
export const LIQUIDACION_EN_DOLARES: Liquidacion = { ...LIQUIDACION, id: 63, numero: 'L-000004', moneda: 'USD' }

export const LIQUIDACION_ANULADA: Liquidacion = { ...LIQUIDACION, id: 62, numero: 'L-000003', estado: 'anulada', items: [] }

export const FONDOS: FondosDeTerceros = {
  a_pagar_a_propietarios: [
    { tercero_id: 1, nombre: 'Ana Inventada', saldo: '205500.00', moneda: 'ARS' },
    { tercero_id: 2, nombre: 'Beto Ejemplo', saldo: '136000.00', moneda: 'ARS' },
  ],
  inquilinos_deudores: [{ tercero_id: 3, nombre: 'Carla Ficticia', saldo: '462500.50', moneda: 'ARS' }],
  totales: [{ moneda: 'ARS', a_pagar: '341500.00', adeudado: '462500.50' }],
}

/** Fondos con pesos y dólares: Ana tiene saldo en las dos monedas, y los totales van uno por moneda. */
export const FONDOS_EN_DOS_MONEDAS: FondosDeTerceros = {
  a_pagar_a_propietarios: [
    { tercero_id: 1, nombre: 'Ana Inventada', saldo: '205500.00', moneda: 'ARS' },
    { tercero_id: 1, nombre: 'Ana Inventada', saldo: '1800.50', moneda: 'USD' },
    { tercero_id: 2, nombre: 'Beto Ejemplo', saldo: '136000.00', moneda: 'ARS' },
  ],
  inquilinos_deudores: [
    { tercero_id: 3, nombre: 'Carla Ficticia', saldo: '462500.50', moneda: 'ARS' },
    { tercero_id: 3, nombre: 'Carla Ficticia', saldo: '1200.00', moneda: 'USD' },
  ],
  totales: [
    { moneda: 'ARS', a_pagar: '341500.00', adeudado: '462500.50' },
    { moneda: 'USD', a_pagar: '1800.50', adeudado: '1200.00' },
  ],
}
