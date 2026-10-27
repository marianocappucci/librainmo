/**
 * El vocabulario del dominio, tal como viaja en la API, y cómo se escribe en pantalla.
 *
 * Los códigos son parte del contrato con el backend (`app/models/propiedades.py` y `app/models/contratos.py`); las
 * etiquetas son sólo presentación y se cambian acá, en un solo lugar.
 */
import type { TonoEstado } from 'libra-ui/badge-estado'

// ── Roles y permisos (`app/roles.py`) ───────────────────────────────────

export const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'operador', label: 'Operador' },
] as const

export type Rol = (typeof ROLES)[number]['value']

export function etiquetaDeRol(rol: string | undefined): string {
  return ROLES.find((r) => r.value === rol)?.label ?? rol ?? ''
}

// ── Listas de opciones ──────────────────────────────────────────────────

export type Opcion = { value: string; label: string }

/** La etiqueta de un código de una lista; lo desconocido sale tal cual (un código nuevo del backend se ve, no se esconde). */
export function etiquetaDe(lista: readonly Opcion[], valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  return lista.find((o) => o.value === valor)?.label ?? valor
}

// ── Propiedades (`app/models/propiedades.py`) ───────────────────────────

export const TIPOS_DE_PROPIEDAD = [
  { value: 'departamento', label: 'Departamento' },
  { value: 'casa', label: 'Casa' },
  { value: 'ph', label: 'PH' },
  { value: 'local', label: 'Local' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'cochera', label: 'Cochera' },
  { value: 'terreno', label: 'Terreno' },
  { value: 'galpon', label: 'Galpón' },
  { value: 'otro', label: 'Otro' },
] as const satisfies readonly Opcion[]

/** La dirección con su unidad (piso, depto., local): «Calle Inventada 123 · 4° B». */
export function direccionCompleta(p: { direccion: string; unidad: string | null }): string {
  return p.unidad ? `${p.direccion} · ${p.unidad}` : p.direccion
}

/** El estado que la pone y la saca el contrato (ADR-004, punto 3): nunca se elige a mano. */
export const ESTADO_ALQUILADA = 'alquilada'

export const ESTADOS_DE_PROPIEDAD = [
  { value: 'disponible', label: 'Disponible' },
  { value: ESTADO_ALQUILADA, label: 'Alquilada' },
  { value: 'en_venta', label: 'En venta' },
  { value: 'reservada', label: 'Reservada' },
  { value: 'vendida', label: 'Vendida' },
  { value: 'baja', label: 'De baja' },
] as const satisfies readonly Opcion[]

/** Los estados que se pueden elegir a mano: todos menos «alquilada». */
export const ESTADOS_ELEGIBLES_DE_PROPIEDAD: readonly Opcion[] = ESTADOS_DE_PROPIEDAD.filter((e) => e.value !== ESTADO_ALQUILADA)

/** Una propiedad vendida o dada de baja no admite contrato nuevo (el servidor lo rechaza al activar). */
export const ESTADOS_SIN_CONTRATO = ['vendida', 'baja']

export function tonoDeEstadoDePropiedad(estado: string): TonoEstado {
  switch (estado) {
    case 'disponible': return 'ok'
    case ESTADO_ALQUILADA: return 'curso'
    case 'en_venta':
    case 'reservada': return 'atencion'
    default: return 'neutro'
  }
}

// ── Contratos (`app/models/contratos.py`) ───────────────────────────────

export const ESTADOS_DE_CONTRATO = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'vigente', label: 'Vigente' },
  { value: 'rescindido', label: 'Rescindido' },
  { value: 'finalizado', label: 'Finalizado' },
] as const satisfies readonly Opcion[]

export function tonoDeEstadoDeContrato(estado: string): TonoEstado {
  switch (estado) {
    case 'vigente': return 'ok'
    case 'rescindido': return 'negativo'
    default: return 'neutro'
  }
}

/** Un contrato rescindido o finalizado ya no cambia ni se le cargan garantías o conceptos. */
export const ESTADOS_CERRADOS_DE_CONTRATO = ['rescindido', 'finalizado']

export const MONEDAS = [
  { value: 'ARS', label: 'Pesos (ARS)' },
  { value: 'USD', label: 'Dólares (USD)' },
] as const satisfies readonly Opcion[]

/** La moneda en una frase: «en pesos», «en dólares» (`ARS` → `pesos`, `USD` → `dólares`). Lo desconocido se devuelve como vino. */
export function nombreDeMoneda(moneda: string): string {
  return moneda === 'ARS' ? 'pesos' : moneda === 'USD' ? 'dólares' : moneda
}

export const METODO_FIJO = 'fijo'
export const METODO_PORCENTAJE = 'porcentaje'
export const METODO_INDICE = 'indice'

export const METODOS_DE_AJUSTE = [
  { value: METODO_FIJO, label: 'Sin ajuste (importe fijo)' },
  { value: METODO_PORCENTAJE, label: 'Porcentaje pactado' },
  { value: METODO_INDICE, label: 'Índice oficial' },
] as const satisfies readonly Opcion[]

export const PERIODICIDADES = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
] as const satisfies readonly Opcion[]

export const BASES_DE_PUNITORIO = [
  { value: 'diaria', label: 'Por día de atraso' },
  { value: 'mensual', label: 'Por mes de atraso' },
] as const satisfies readonly Opcion[]

export const DESTINOS_DE_PUNITORIO = [
  { value: 'inmobiliaria', label: 'La inmobiliaria' },
  { value: 'propietario', label: 'El propietario' },
] as const satisfies readonly Opcion[]

export const TIPOS_DE_GARANTIA = [
  { value: 'propietaria', label: 'Garantía propietaria' },
  { value: 'caucion', label: 'Seguro de caución' },
  { value: 'recibo_sueldo', label: 'Recibo de sueldo' },
  { value: 'otra', label: 'Otra' },
] as const satisfies readonly Opcion[]

/** El seguro de caución no tiene una persona detrás: no lleva garante. */
export const GARANTIA_SIN_GARANTE = 'caucion'

export const TIPOS_DE_CONCEPTO = [
  { value: 'expensas', label: 'Expensas' },
  { value: 'abl', label: 'ABL' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'otro', label: 'Otro' },
] as const satisfies readonly Opcion[]

export const PAGADORES = [
  { value: 'inquilino', label: 'Lo paga el inquilino' },
  { value: 'propietario', label: 'Lo paga el propietario' },
] as const satisfies readonly Opcion[]

/** Por qué se cargó un precio (`contrato_precios.motivo`). */
export const MOTIVOS_DE_PRECIO = [
  { value: 'inicial', label: 'Precio inicial' },
  { value: 'manual', label: 'Actualización manual' },
  { value: 'ajuste_porcentaje', label: 'Ajuste por porcentaje' },
] as const satisfies readonly Opcion[]

/** El motivo de un precio con nombre legible. Un ajuste por índice llega como `ajuste_indice:icl` (con la clave del índice). */
export function etiquetaDeMotivoDePrecio(motivo: string): string {
  if (motivo.startsWith('ajuste_indice:')) return `Ajuste por índice (${motivo.slice('ajuste_indice:'.length).toUpperCase()})`
  return etiquetaDe(MOTIVOS_DE_PRECIO, motivo)
}

// ── Cuotas, cobros, gastos y liquidaciones (`app/models/{cuotas,cobros,liquidaciones}.py`) ──

export const ESTADOS_DE_CUOTA = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'cobrada', label: 'Cobrada' },
  { value: 'anulada', label: 'Anulada' },
] as const satisfies readonly Opcion[]

export function tonoDeEstadoDeCuota(estado: string): TonoEstado {
  switch (estado) {
    case 'pendiente': return 'atencion'
    case 'cobrada': return 'ok'
    default: return 'neutro'
  }
}

/**
 * Con qué puede pagar un inquilino: los medios de `libracore.medios_pago.ELEGIBLES` menos «cuenta corriente» (el cobro es justamente lo
 * que salda la cuenta). 🟡 Copia a mano: el backend de LibraInmo no tiene un endpoint que los sirva (los de la familia, `GET
 * /api/ventas/medios-pago`, son de los productos de comercio). Si el motor suma uno, hay que sumarlo acá.
 */
export const MEDIOS_DE_COBRO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'cuenta_dni', label: 'Cuenta DNI' },
  { value: 'billetera', label: 'Otras billeteras' },
  { value: 'cheque', label: 'Cheque' },
] as const satisfies readonly Opcion[]

/** Cómo recibe el propietario el neto de su liquidación (`MEDIOS_DE_PAGO` de `app/servicios/liquidaciones.py`). */
export const MEDIOS_DE_PAGO_AL_PROPIETARIO = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
] as const satisfies readonly Opcion[]

/** Qué parte del cobro es cada imputación a un propietario. */
export const TIPOS_DE_IMPUTACION = [
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'concepto', label: 'Conceptos' },
  { value: 'punitorio', label: 'Punitorio' },
] as const satisfies readonly Opcion[]

export const CATEGORIAS_DE_GASTO = [
  { value: 'reparacion', label: 'Reparación' },
  { value: 'expensas_extraordinarias', label: 'Expensas extraordinarias' },
  { value: 'impuesto', label: 'Impuesto' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'honorarios', label: 'Honorarios' },
  { value: 'otro', label: 'Otro' },
] as const satisfies readonly Opcion[]

export const ESTADOS_DE_LIQUIDACION = [
  { value: 'emitida', label: 'Emitida' },
  { value: 'pagada', label: 'Pagada' },
  { value: 'anulada', label: 'Anulada' },
] as const satisfies readonly Opcion[]

export function tonoDeEstadoDeLiquidacion(estado: string): TonoEstado {
  switch (estado) {
    case 'emitida': return 'atencion'
    case 'pagada': return 'ok'
    default: return 'neutro'
  }
}
