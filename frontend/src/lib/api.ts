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
 * Hoy no hay tipos ni llamadas de dominio: entran con la fase 1 del `ROADMAP.md`
 * (propiedades, contratos…), junto a los espejos de `app/schemas/`.
 */
import { api, ApiError } from 'libra-ui/api-client'

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
