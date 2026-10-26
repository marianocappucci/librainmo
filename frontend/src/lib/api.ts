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

export const contratos = {
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
