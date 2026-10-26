/**
 * El **único** lugar donde se formatea una fecha en el frontend.
 *
 * La regla del ecosistema: la API habla ISO 8601 en las dos direcciones, y
 * `dd-mm-aaaa` es sólo presentación. Repetir el formateo por pantalla es cómo
 * terminan tres pantallas mostrando la misma fecha de tres formas, y cómo una
 * de ellas queda en UTC sin que nadie lo note.
 *
 * Todo en hora de Argentina (`TZ`): el producto corre en una inmobiliaria
 * argentina y el backend guarda `timestamptz` y habla `-03:00`.
 */

export const TZ = 'America/Argentina/Buenos_Aires'

/** Un `aaaa-mm-dd` pelado, tal como lo serializa una columna `date`. */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

function aDate(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * `dd-mm-aaaa`. Acepta ISO o `Date`.
 *
 * 🔴 **Un `aaaa-mm-dd` no es un instante: es un día del calendario**, y
 * convertirlo de zona lo corre uno para atrás SIEMPRE (`new Date('2026-08-22')`
 * es medianoche UTC, las 21:00 del 21 en Argentina). El vencimiento de un
 * contrato y la fecha de inicio de un alquiler son de esta clase: se reordena el texto
 * sin construir un `Date`, que es lo único que no puede volver a corromperse.
 *
 * 🔴 Se arma con `formatToParts` y no con el `format()` de `es-AR` directo: ese
 * devuelve `01/09/2026`, con barras, y la convención del ecosistema es con
 * guiones.
 */
export function fecha(valor: string | Date | null | undefined): string {
  if (typeof valor === 'string') {
    const partes = SOLO_FECHA.exec(valor)
    if (partes) return `${partes[3]}-${partes[2]}-${partes[1]}`
  }
  const d = aDate(valor)
  if (!d) return ''
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${parte('day')}-${parte('month')}-${parte('year')}`
}

/** Sólo `HH:MM`, reloj de 24 h, en hora de Argentina. */
export function hora(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  if (!d) return ''
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    // `h23` y no `hour12: false`: éste último puede devolver «24:05» a la medianoche.
    hourCycle: 'h23',
  }).format(d)
}

/** `dd-mm-aaaa HH:MM`, reloj de 24 h, en hora de Argentina. */
export function fechaHora(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  if (!d) return ''
  return `${fecha(d)} ${hora(d)}`
}

/**
 * La fecha en ISO `aaaa-mm-dd` **para la institución**, no para el navegador.
 *
 * 🔴 `Date.toISOString().slice(0,10)` da el día en UTC: a las 21:00 de Argentina
 * ya devuelve el día siguiente, y un formulario abriría con la fecha de mañana
 * justo en la franja de la tarde.
 */
export function diaISO(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  if (!d) return ''
  // `en-CA` formatea como `aaaa-mm-dd`, que es exactamente ISO.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

/** Hoy, en ISO `aaaa-mm-dd`, según el reloj de la institución. */
export function hoyISO(): string {
  return diaISO(new Date())
}

/**
 * De un instante de la API (`2026-10-27T09:30:00-03:00`) al valor de un
 * `<input type="datetime-local">` (`2026-10-27T09:30`), en hora de Argentina.
 */
export function aDatetimeLocal(valor: string | Date | null | undefined): string {
  const d = aDate(valor)
  if (!d) return ''
  return `${diaISO(d)}T${hora(d)}`
}

/**
 * Del valor de un `<input type="datetime-local">` (`2026-10-27T09:30`) a lo que
 * se manda a la API.
 *
 * Se manda **sin zona**, tal cual se escribió: el backend toma un datetime sin
 * zona como hora argentina (`app/tiempo.a_local`), que es lo que la persona
 * quiso decir. Convertirlo en el navegador lo haría depender de la zona de la
 * máquina.
 */
export function desdeDatetimeLocal(valor: string): string {
  return valor.length === 16 ? `${valor}:00` : valor
}

// ── Meses (para las cuotas, que se piden y se leen por mes) ─────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Cuántos días tiene un mes (`anio`, `mes` 1–12), por aritmética de calendario: no se arma un `Date`, que depende de la zona del
 * navegador y ya corrió un día más de una vez (`fecha`, arriba).
 */
export function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(mes) ? 30 : 31
}

const MES_ISO = /^(\d{4})-(\d{2})/

/** `2026-11-15` o `2026-11` → `2026-11` (lo que da y recibe un `<input type="month">`). Vacío si no es una fecha. */
export function mesDe(iso: string | null | undefined): string {
  const m = iso ? MES_ISO.exec(iso) : null
  return m ? `${m[1]}-${m[2]}` : ''
}

/** El primer día de un mes `aaaa-mm`: `2026-11` → `2026-11-01`. Es el `ancla` que pide la API de cuotas. */
export function primerDiaDelMes(mes: string): string {
  const m = MES_ISO.exec(mes)
  return m ? `${m[1]}-${m[2]}-01` : ''
}

/** El último día de un mes `aaaa-mm`: `2026-02` → `2026-02-28`. */
export function ultimoDiaDelMes(mes: string): string {
  const m = MES_ISO.exec(mes)
  if (!m) return ''
  return `${m[1]}-${m[2]}-${String(diasDelMes(Number(m[1]), Number(m[2]))).padStart(2, '0')}`
}

/** `2026-11-15` o `2026-11` → «noviembre 2026». Vacío si no es una fecha. */
export function nombreDelMes(iso: string | null | undefined): string {
  const m = iso ? MES_ISO.exec(iso) : null
  return m ? `${MESES[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : ''
}
