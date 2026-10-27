/**
 * Los tipos y las llamadas a la API de LibraInmo.
 *
 * El cliente HTTP es el del kit (`libra-ui/api-client`): misma cookie de sesión
 * (`credentials: 'include'`, mismo origen), y además trae lo que no conviene
 * repetir en cada pantalla — la sesión vencida manda al login y los Términos
 * pendientes disparan su pantalla de aceptación.
 *
 * Todo lo que sale de acá habla **ISO 8601**. El `dd-mm-aaaa` es de `fechas.ts`
 * y no toca la API.
 *
 * Los tipos son el espejo de lo que devuelven `app/servicios/` y de lo que piden
 * `app/schemas/`. 🔴 **Los importes y porcentajes son `string`** (texto decimal,
 * `"450000.00"`): nunca se convierten a `number` para operar (`importes.ts`).
 */
import { api, ApiError } from 'libra-ui/api-client'
import type { ClienteDeVenta } from 'libra-ui/comercio/tipos'

export { api, ApiError }

// ── Errores ─────────────────────────────────────────────────────────────

/** Un error de validación de pydantic (`422` de FastAPI): `{ loc, msg }`. */
type ErrorDeCampo = { loc?: unknown[]; msg?: string }

/** Cómo se llaman los campos en un mensaje de validación. Se suman los del dominio a medida que entran. */
const NOMBRES_DE_CAMPOS: Record<string, string> = {
  username: 'Usuario',
  name: 'Nombre',
  password: 'Contraseña',
  role: 'Rol',
  tipo: 'Tipo',
  direccion: 'Dirección',
  estado: 'Estado',
  porcentaje: 'Porcentaje',
  fecha_inicio: 'Fecha de inicio',
  fecha_fin: 'Fecha de fin',
  importe_inicial: 'Alquiler inicial',
  importe: 'Importe',
  vigencia_desde: 'Vigencia desde',
  dia_vencimiento: 'Día de vencimiento',
  comision_pct: 'Comisión',
  fecha: 'Fecha',
  ancla: 'Mes',
  motivo: 'Motivo',
  monto: 'Monto',
  medio_pago: 'Medio de pago',
  referencia: 'Referencia',
  medios: 'Medios de pago',
  categoria: 'Categoría',
  descripcion: 'Descripción',
  comprobante: 'Comprobante',
  hasta: 'Hasta',
  propietario_id: 'Propietario',
  propiedad_id: 'Propiedad',
  fecha_ajuste: 'Fecha del ajuste',
}

/**
 * El texto de un error de la API para mostrar en pantalla.
 *
 * 🔴 El `detail` de FastAPI es un string en los errores de dominio del backend
 * (409, 422 de `app/errores.py`) **y una lista** en los de validación de pydantic.
 * Mostrarlo sin distinguir deja al operador leyendo «Unprocessable Entity» o
 * `[object Object]`: el cliente del kit conserva el original en `detailData`, y
 * de ahí se arma el mensaje.
 */
export function mensajeDeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (Array.isArray(err.detailData)) {
      const textos = (err.detailData as ErrorDeCampo[])
        .map((e) => {
          const campo = String(e.loc?.[e.loc.length - 1] ?? '')
          const msg = (e.msg ?? '').replace(/^Value error, /, '')
          const nombre = NOMBRES_DE_CAMPOS[campo]
          return nombre ? `${nombre}: ${msg}` : msg
        })
        .filter(Boolean)
      if (textos.length) return textos.join(' · ')
    }
    return err.detail || `Error ${err.status}`
  }
  return 'Error de conexión.'
}

// ── Llamadas ────────────────────────────────────────────────────────────

/** Arma `?a=1&b=2` sin los valores vacíos; los arreglos repiten el parámetro. */
export function consulta(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined || valor === '') continue
    if (Array.isArray(valor)) valor.forEach((v) => q.append(clave, v))
    else q.append(clave, String(valor))
  }
  const texto = q.toString()
  return texto ? `?${texto}` : ''
}

// ── Clientes del motor (`libracore.clientes_router`) ────────────────────

/** Inquilinos, titulares y garantes son filas de `clients` del motor (ADR-004). */
export const clientes = {
  listar: () => api.get<ClienteDeVenta[]>('/api/clientes'),
}

// ── Propiedades (`app/routers/propiedades.py`) ──────────────────────────

export interface TitularDePropiedad {
  cliente_id: number
  nombre: string
  /** Texto decimal con dos decimales: `"66.67"`. */
  porcentaje: string
}

export interface ContratoVigenteDeLaPropiedad {
  id: number
  numero: string
}

export interface Propiedad {
  id: number
  /** `P-000001`. */
  codigo: string
  tipo: string
  direccion: string
  unidad: string | null
  localidad: string
  partida_abl: string | null
  partida_arba: string | null
  estado: string
  observaciones: string | null
  titulares: TitularDePropiedad[]
  /** Los titulares suman 100 %. */
  titulares_completos: boolean
  contrato_vigente: ContratoVigenteDeLaPropiedad | null
}

export interface PropiedadEntrada {
  tipo: string
  direccion: string
  unidad: string | null
  localidad: string
  partida_abl: string | null
  partida_arba: string | null
  estado: string
  observaciones: string | null
}

export interface TitularEntrada {
  cliente_id: number
  porcentaje: string
}

/** El tope de página del backend (`Query(50, le=200)`): no hay total, así que se pide el máximo y se avisa si se llegó. */
export const LIMITE_DE_PAGINA = 200

/** El tope de página de cuotas, cobros, gastos y liquidaciones (`Query(100, le=500)`): también sin total, así que se pide el máximo. */
export const LIMITE_DE_PAGINA_GRANDE = 500

export const propiedades = {
  listar: (f: { q?: string; estado?: string; limit?: number; offset?: number } = {}) =>
    api.get<Propiedad[]>(`/api/propiedades${consulta({ limit: LIMITE_DE_PAGINA, ...f })}`),
  obtener: (id: number | string) => api.get<Propiedad>(`/api/propiedades/${id}`),
  crear: (datos: PropiedadEntrada) => api.post<Propiedad>('/api/propiedades', datos),
  editar: (id: number, datos: Partial<PropiedadEntrada>) => api.put<Propiedad>(`/api/propiedades/${id}`, datos),
  /** Reemplaza la lista ENTERA: los porcentajes suman 100 o el servidor rechaza (422). */
  fijarTitulares: (id: number, titulares: TitularEntrada[]) =>
    api.put<Propiedad>(`/api/propiedades/${id}/titulares`, titulares),
}

// ── Contratos (`app/routers/contratos.py`) ──────────────────────────────

export interface Contrato {
  id: number
  /** `C-000001`. */
  numero: string
  estado: string
  propiedad_id: number
  propiedad_codigo: string
  propiedad_direccion: string
  inquilino_id: number
  inquilino_nombre: string
  fecha_inicio: string
  fecha_fin: string
  fecha_rescision: string | null
  moneda: string
  dia_vencimiento: number
  dias_gracia: number
  metodo_ajuste: string
  indice_ajuste: string | null
  indice_ajuste_nombre: string | null
  /** Tres decimales: `"5.000"`. */
  porcentaje_ajuste: string | null
  periodicidad_ajuste: string | null
  /** Cuatro decimales, en porcentaje: `"0.5000"` es 0,5 %. */
  punitorio_tasa: string | null
  punitorio_base: string
  punitorio_para: string
  comision_pct: string
  deposito: string | null
  observaciones: string | null
  importe_vigente: string | null
  precio_vigente_desde: string | null
}

export interface PrecioDelContrato {
  id: number
  vigencia_desde: string
  /** `null` = es el precio vigente. */
  vigencia_hasta: string | null
  importe: string
  motivo: string
  usuario: string
}

export interface GarantiaDelContrato {
  id: number
  tipo: string
  garante_id: number | null
  garante_nombre: string
  descripcion: string | null
  vence: string | null
}

export interface ConceptoDelContrato {
  id: number
  concepto: string
  descripcion: string
  paga: string
  /** `null` = variable: se informa cada mes. */
  importe: string | null
  activo: boolean
}

export interface ContratoDetalle extends Contrato {
  precios: PrecioDelContrato[]
  garantias: GarantiaDelContrato[]
  conceptos: ConceptoDelContrato[]
}

export interface ContratoEntrada {
  propiedad_id: number
  inquilino_id: number
  fecha_inicio: string
  fecha_fin: string
  importe_inicial: string
  moneda: string
  dia_vencimiento: number
  dias_gracia: number
  metodo_ajuste: string
  indice_ajuste: string | null
  porcentaje_ajuste: string | null
  periodicidad_ajuste: string | null
  punitorio_tasa: string | null
  punitorio_base: string
  punitorio_para: string
  comision_pct: string
  deposito: string | null
  observaciones: string | null
}

export interface GarantiaEntrada {
  tipo: string
  garante_id: number | null
  descripcion: string | null
  vence: string | null
}

export interface ConceptoEntrada {
  concepto: string
  descripcion: string
  paga: string
  importe: string | null
}

/** Lo que cambia un `PUT`: sólo se manda lo que se quiere cambiar (`importe: null` lo vuelve variable). */
export type ConceptoCambio = Partial<{ descripcion: string; paga: string; importe: string | null; activo: boolean }>

/** Un índice del catálogo del motor (`GET /api/contratos/ajustes/indices`). */
export interface IndiceDeAjuste {
  clave: string
  nombre: string
  periodicidad: string
  /** Se descarga solo de la fuente oficial; si no, se carga a mano en el motor. */
  se_baja_solo: boolean
}

/** Un valor de un índice que entró en la cuenta del ajuste. */
export interface ValorDeIndice {
  fecha: string
  /** Texto decimal sin redondear. */
  valor: string
  fuente: string
  /** Si el índice no tiene valor exactamente ese día, la fecha que se pidió. */
  fecha_pedida?: string
}

export interface Ajuste {
  metodo: 'indice' | 'porcentaje'
  importe_anterior: string
  importe_nuevo: string
  /** Texto decimal sin redondear: quien lo imprime elige cuántos decimales muestra. */
  coeficiente: string
  variacion_pct: string
  // Por índice:
  indice?: string
  indice_nombre?: string
  valores?: ValorDeIndice[]
  // Por porcentaje:
  porcentaje?: string
  periodos?: number
}

/** `GET /api/contratos/{id}/ajuste`: lo que le toca al contrato, sin escribir nada. */
export interface PropuestaDeAjuste {
  corresponde: boolean
  /** Si no corresponde: todavía no cumplió su primer período, o el período en curso ya tiene su precio. */
  motivo: 'primer_periodo' | 'ya_ajustado' | null
  fecha_ajuste: string
  proximo_ajuste: string
  precio_vigente: string
  precio_vigente_desde: string
  ajuste: Ajuste | null
}

/** El 409 de un ajuste por índice al que le falta un valor: `detail` es un objeto, no un texto. */
export interface FaltaDeIndice {
  mensaje: string
  indice: string
  indice_nombre: string
  fechas_faltantes: string[]
}

/** El `detail` estructurado de «falta un valor del índice», o `null` si el error es otra cosa. */
export function faltaDeIndice(err: unknown): FaltaDeIndice | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null
  const d = err.detailData as Partial<FaltaDeIndice> | undefined
  return d && typeof d === 'object' && Array.isArray(d.fechas_faltantes) ? (d as FaltaDeIndice) : null
}

export const contratos = {
  indices: () => api.get<IndiceDeAjuste[]>('/api/contratos/ajustes/indices'),
  /** El ajuste que le toca al contrato (hoy, o en `fecha`). No escribe. Con un índice sin valor, 409 con `FaltaDeIndice`. */
  proponerAjuste: (id: number, fecha?: string) =>
    api.get<PropuestaDeAjuste>(`/api/contratos/${id}/ajuste${consulta({ fecha })}`),
  /** Aplica el ajuste de esa fecha: el servidor rehace la cuenta, no confía en la pantalla. */
  aplicarAjuste: (id: number, fecha_ajuste: string) =>
    api.post<{ contrato: ContratoDetalle; ajuste: Ajuste }>(`/api/contratos/${id}/ajuste`, { fecha_ajuste }),
  listar: (f: { q?: string; estado?: string; propiedad_id?: number; inquilino_id?: number; limit?: number; offset?: number } = {}) =>
    api.get<Contrato[]>(`/api/contratos${consulta({ limit: LIMITE_DE_PAGINA, ...f })}`),
  obtener: (id: number | string) => api.get<ContratoDetalle>(`/api/contratos/${id}`),
  crear: (datos: ContratoEntrada) => api.post<ContratoDetalle>('/api/contratos', datos),
  /** Un borrador se edita entero; uno vigente, sólo `observaciones`. */
  editar: (id: number, datos: Partial<ContratoEntrada>) => api.put<ContratoDetalle>(`/api/contratos/${id}`, datos),
  borrar: (id: number) => api.del<void>(`/api/contratos/${id}`),
  activar: (id: number) => api.post<ContratoDetalle>(`/api/contratos/${id}/activar`),
  rescindir: (id: number, datos: { fecha: string; observaciones: string | null }) =>
    api.post<ContratoDetalle>(`/api/contratos/${id}/rescindir`, datos),
  finalizar: (id: number) => api.post<ContratoDetalle>(`/api/contratos/${id}/finalizar`),
  actualizarPrecio: (id: number, datos: { importe: string; vigencia_desde: string }) =>
    api.post<ContratoDetalle>(`/api/contratos/${id}/precios`, datos),
  agregarGarantia: (id: number, datos: GarantiaEntrada) => api.post<ContratoDetalle>(`/api/contratos/${id}/garantias`, datos),
  quitarGarantia: (id: number, garantiaId: number) => api.del<ContratoDetalle>(`/api/contratos/${id}/garantias/${garantiaId}`),
  agregarConcepto: (id: number, datos: ConceptoEntrada) => api.post<ContratoDetalle>(`/api/contratos/${id}/conceptos`, datos),
  cambiarConcepto: (id: number, conceptoId: number, datos: ConceptoCambio) =>
    api.put<ContratoDetalle>(`/api/contratos/${id}/conceptos/${conceptoId}`, datos),
}

// ── Cuotas (`app/routers/cuotas.py`) ────────────────────────────────────

export interface LineaDeCuota {
  id: number
  tipo: 'alquiler' | 'concepto'
  concepto_id: number | null
  descripcion: string
  importe: string
}

export interface Cuota {
  id: number
  /** La moneda del contrato (`ARS` | `USD`): todos los importes de la cuota vienen en ella. */
  moneda: string
  contrato_id: number
  numero_contrato: string
  inquilino_id: number
  inquilino_nombre: string
  periodo_desde: string
  periodo_hasta: string
  fecha_emision: string
  fecha_vencimiento: string
  prorrateada: boolean
  dias_cubiertos: number
  dias_del_periodo: number
  total: string
  estado: string
  /** Lo que paga el propietario por cuenta de esta cuota, ya cargado como gasto. Una cuota sin ninguno lo trae vacío. */
  gastos_del_propietario: GastoDeLaCuota[]
  lineas: LineaDeCuota[]
}

/** Un gasto por cuenta del propietario nacido de una cuota: se anula con ella, no suelto. */
export interface GastoDeLaCuota {
  id: number
  descripcion: string
  importe: string
  anulado: boolean
}

/** Un tramo de precio dentro del mes: un ajuste a mitad de mes parte la cuota en dos o más. */
export interface TramoDeCuota {
  precio_id: number
  desde: string
  hasta: string
  dias: number
  importe: string
  /** `true` si es el tramo que ya lleva el precio ajustado. */
  ajuste: boolean
}

export interface PropuestaDeCuota {
  contrato_id: number
  numero: string
  bloqueada: null
  /** La moneda del contrato: los importes de la propuesta vienen en ella. */
  moneda: string
  precio_id: number
  periodo_desde: string
  periodo_hasta: string
  fecha_emision: string
  fecha_vencimiento: string
  prorrateada: boolean
  dias_cubiertos: number
  dias_del_periodo: number
  /** El alquiler del mes: la suma de los `tramos`. */
  alquiler: string
  /** Un tramo por precio. Con uno solo no hay ajuste a mitad de mes; con más de uno la cuota lleva una línea de alquiler por tramo. */
  tramos: TramoDeCuota[]
  /** Los conceptos fijos que paga el inquilino, con su importe. */
  conceptos: { concepto_id: number; descripcion: string; importe: string }[]
  /** Los variables (las expensas): sin importe hasta que se carga el del mes. */
  variables: { concepto_id: number; descripcion: string }[]
  /** Los conceptos fijos que paga el propietario: al generar se cargan solos como gasto por su cuenta. */
  gastos_del_propietario: { concepto_id: number; descripcion: string; importe: string }[]
  /** Los que paga el propietario y no tienen importe: se cargan como gasto cuando llega el monto. */
  a_cargar_como_gasto: { concepto_id: number; descripcion: string }[]
}

export interface PrevisualizacionDeCuotas {
  periodo_desde: string
  periodo_hasta: string
  propuestas: PropuestaDeCuota[]
  ya_generadas: { contrato_id: number; numero: string; cuota_id: number }[]
  /** Un contrato con un ajuste pendiente no genera su cuota hasta aplicarlo. */
  bloqueadas: { contrato_id: number; numero: string; motivo: string }[]
}

export interface GenerarCuotas {
  ancla: string
  contrato_ids?: number[]
  /** `{concepto_id: importe}` de los conceptos variables que se cargan ya. */
  variables: Record<string, string>
}

export const cuotas = {
  listar: (f: { contrato_id?: number; estado?: string; desde?: string; hasta?: string; limit?: number; offset?: number } = {}) =>
    api.get<Cuota[]>(`/api/cuotas${consulta({ limit: LIMITE_DE_PAGINA_GRANDE, ...f })}`),
  obtener: (id: number | string) => api.get<Cuota>(`/api/cuotas/${id}`),
  previsualizar: (datos: Omit<GenerarCuotas, 'variables'>) =>
    api.post<PrevisualizacionDeCuotas>('/api/cuotas/previsualizar', datos),
  generar: (datos: GenerarCuotas) => api.post<{ generadas: Cuota[] }>('/api/cuotas/generar', datos),
  /** Un cargo más en una cuota pendiente: las expensas que llegaron después (con `concepto_id`) o un cargo suelto (con `descripcion`). */
  agregarLinea: (id: number, datos: { importe: string; concepto_id?: number | null; descripcion?: string | null }) =>
    api.post<Cuota>(`/api/cuotas/${id}/lineas`, datos),
  anular: (id: number, motivo: string) => api.post<Cuota>(`/api/cuotas/${id}/anular`, { motivo }),
}

// ── Cobros (`app/routers/cobros.py`) ────────────────────────────────────

/** Cuánto cobrar si paga ese día (`GET /api/cuotas/{id}/cobro`). */
export interface PropuestaDeCobro {
  cuota_id: number
  fecha: string
  importe_cuota: string
  punitorio: string
  dias_de_atraso: number
  vencimiento: string
  /** El vencimiento corrido al día hábil siguiente, desde el que corre el punitorio. */
  vencimiento_efectivo: string
  /** La cuota más el punitorio. */
  total: string
  punitorio_para: string
}

export interface MedioDeCobro {
  medio_pago: string
  referencia: string | null
  monto: string
}

export interface ReciboDelCobro {
  id: number
  numero: string | number
  punto_venta: string | number | null
  concepto: string
  anulado: boolean
}

export interface ImputacionDeCobro {
  propietario_id: number
  propietario_nombre: string | null
  tipo: 'alquiler' | 'concepto' | 'punitorio'
  importe: string
}

export interface Cobro {
  id: number
  /** La moneda del contrato de la cuota. */
  moneda: string
  cuota_id: number
  periodo_desde: string
  contrato_id: number
  numero_contrato: string
  inquilino_id: number
  inquilino_nombre: string | null
  fecha: string
  importe_cuota: string
  punitorio: string
  punitorio_condonado: string
  dias_de_atraso: number
  total: string
  medios: MedioDeCobro[]
  anulado: boolean
  motivo_anulacion: string | null
  usuario: string
  recibo: ReciboDelCobro | null
  imputaciones: ImputacionDeCobro[]
}

export interface CobroEntrada {
  fecha: string
  medios: { medio_pago: string; referencia: string | null; monto: string }[]
  condonar_punitorio: boolean
}

/** El PDF del recibo, para abrirlo en otra pestaña (`inline`): la cookie de sesión viaja sola. */
export const urlDelRecibo = (cobroId: number) => `/api/cobros/${cobroId}/recibo.pdf`

export const cobros = {
  proponer: (cuotaId: number | string, fecha?: string) =>
    api.get<PropuestaDeCobro>(`/api/cuotas/${cuotaId}/cobro${consulta({ fecha })}`),
  cobrar: (cuotaId: number, datos: CobroEntrada) => api.post<Cobro>(`/api/cuotas/${cuotaId}/cobrar`, datos),
  listar: (f: { contrato_id?: number; desde?: string; hasta?: string; incluir_anulados?: boolean; limit?: number; offset?: number } = {}) =>
    api.get<Cobro[]>(`/api/cobros${consulta({ limit: LIMITE_DE_PAGINA_GRANDE, ...f })}`),
  obtener: (id: number | string) => api.get<Cobro>(`/api/cobros/${id}`),
  anular: (id: number, motivo: string) => api.post<Cobro>(`/api/cobros/${id}/anular`, { motivo }),
}

// ── Gastos (`app/routers/liquidaciones.py`) ─────────────────────────────

export interface Gasto {
  id: number
  propiedad_id: number
  propiedad_codigo: string
  propiedad_direccion: string
  fecha: string
  categoria: string
  descripcion: string
  importe: string
  moneda: string
  comprobante: string | null
  anulado: boolean
  usuario: string
  /** La cuota de la que nació (un concepto que paga el propietario): si no es `null`, se anula con la cuota y no suelto. */
  cuota_id: number | null
  concepto_id: number | null
  imputaciones: { propietario_id: number; propietario_nombre: string | null; importe: string }[]
}

export interface GastoEntrada {
  propiedad_id: number
  fecha: string
  categoria: string
  descripcion: string
  importe: string
  /** `ARS` | `USD`; si falta, la API usa pesos. */
  moneda?: string
  comprobante: string | null
}

export const gastos = {
  listar: (f: { propiedad_id?: number; desde?: string; hasta?: string; incluir_anulados?: boolean; limit?: number; offset?: number } = {}) =>
    api.get<Gasto[]>(`/api/gastos${consulta({ limit: LIMITE_DE_PAGINA_GRANDE, ...f })}`),
  registrar: (datos: GastoEntrada) => api.post<Gasto>('/api/gastos', datos),
  anular: (id: number, motivo: string) => api.post<Gasto>(`/api/gastos/${id}/anular`, { motivo }),
}

// ── Liquidaciones y fondos de terceros ──────────────────────────────────

export interface ItemDeLiquidacion {
  asiento_id: number
  tipo: 'cobro' | 'gasto'
  fecha: string
  descripcion: string
  /** Positivo lo cobrado a favor del propietario; negativo lo que se le descuenta. */
  importe: string
  /** La parte de alquiler sobre la que se calcula la comisión. */
  base_comision: string
  comision_pct: string
  comision: string
}

export interface TotalesDeLiquidacion {
  cobrado: string
  gastos: string
  comision: string
  neto: string
}

export interface PrevisualizacionDeLiquidacion extends TotalesDeLiquidacion {
  propietario_id: number
  propietario_nombre: string | null
  hasta: string
  /** La moneda de esta liquidación: entran sólo los movimientos en ella. */
  moneda: string
  /** En qué monedas tiene el propietario movimientos sin liquidar (puede incluir la que no se está mirando). */
  monedas_con_pendientes: string[]
  items: ItemDeLiquidacion[]
}

export interface Liquidacion extends TotalesDeLiquidacion {
  id: number
  /** `L-000001`. */
  numero: string
  propietario_id: number
  propietario_nombre: string | null
  fecha: string
  hasta: string
  moneda: string
  estado: string
  fecha_pago: string | null
  medio_pago: string | null
  referencia_pago: string | null
  observaciones: string | null
  usuario: string
  items: ItemDeLiquidacion[]
}

export interface SaldoDeTercero {
  tercero_id: number
  nombre: string | null
  saldo: string
  moneda: string
}

export interface FondosDeTerceros {
  a_pagar_a_propietarios: SaldoDeTercero[]
  inquilinos_deudores: SaldoDeTercero[]
  /** Un total por moneda con movimientos (si no hay ninguno, uno en pesos): nunca se suman monedas distintas. */
  totales: { moneda: string; a_pagar: string; adeudado: string }[]
}

export const urlDelPdfDeLiquidacion = (id: number) => `/api/liquidaciones/${id}/pdf`

export const liquidaciones = {
  previsualizar: (propietario_id: number, hasta: string, moneda?: string) =>
    api.get<PrevisualizacionDeLiquidacion>(`/api/liquidaciones/previsualizar${consulta({ propietario_id, hasta, moneda })}`),
  listar: (f: { propietario_id?: number; estado?: string; moneda?: string; limit?: number; offset?: number } = {}) =>
    api.get<Liquidacion[]>(`/api/liquidaciones${consulta({ limit: LIMITE_DE_PAGINA_GRANDE, ...f })}`),
  obtener: (id: number | string) => api.get<Liquidacion>(`/api/liquidaciones/${id}`),
  emitir: (datos: { propietario_id: number; fecha: string; hasta: string; moneda: string; observaciones: string | null }) =>
    api.post<Liquidacion>('/api/liquidaciones', datos),
  pagar: (id: number, datos: { fecha: string; medio_pago: string; referencia: string | null }) =>
    api.post<Liquidacion>(`/api/liquidaciones/${id}/pagar`, datos),
  anular: (id: number, motivo: string) => api.post<Liquidacion>(`/api/liquidaciones/${id}/anular`, { motivo }),
}

export const reportes = {
  fondosDeTerceros: () => api.get<FondosDeTerceros>('/api/reportes/fondos-de-terceros'),
}
