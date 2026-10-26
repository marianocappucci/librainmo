/**
 * Importes y porcentajes: cómo se leen de la API, cómo se muestran y cómo se interpreta lo que se escribe.
 *
 * 🔴 **Nunca pasan por `number` para operar.** La API manda la plata de terceros como texto decimal con la escala de su columna
 * (`"450000.00"`, `"66.67"`, ADR-004 punto 6): un `float` no tiene centavos exactos. Acá todo se hace sobre el texto —se reordena
 * el entero y la coma, no se calcula— y lo único que se suma son centésimas enteras (`aCentesimas`), que caben de sobra en un
 * entero seguro. Lo que se manda de vuelta también es texto decimal (`aDecimal`).
 */

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/
/** `450.000`, `1.234.567`: puntos de miles argentinos, sin coma. */
const CON_PUNTOS_DE_MILES = /^\d{1,3}(?:\.\d{3})+$/

const NBSP = ' '

/** `1234567` → `1.234.567`. */
function conMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Un decimal de la API (`"450000.5"`) con miles y coma argentinos (`450.000,50`).
 *
 * `decimales` es el mínimo que se muestra (los ceros que sobran de la columna se descartan hasta ahí): `"66.670"` con 2 es `66,67`,
 * y `"0.0125"` conserva sus 4 decimales. Lo que no es un decimal —vacío, `null`, texto raro— se devuelve como vino, para no
 * esconder un dato inesperado detrás de un «NaN».
 */
export function numeroArgentino(texto: string | null | undefined, decimales = 2): string {
  if (texto === null || texto === undefined || texto === '') return ''
  const m = DECIMAL.exec(texto.trim())
  if (!m) return texto
  const [, signo, entero, fraccion = ''] = m
  const resto = fraccion.replace(/0+$/, '').padEnd(decimales, '0')
  return `${signo}${conMiles(entero.replace(/^0+(?=\d)/, ''))}${resto ? `,${resto}` : ''}`
}

/** `$ 450.000,00`; en dólares, `US$ 1.200,00`. Vacío si no hay importe. */
export function pesos(texto: string | null | undefined, moneda = 'ARS'): string {
  const n = numeroArgentino(texto, 2)
  if (n === '') return ''
  return `${moneda === 'USD' ? 'US$' : '$'}${NBSP}${n}`
}

/** `66,67 %`. Vacío si no hay valor. */
export function porcentaje(texto: string | null | undefined, decimales = 2): string {
  const n = numeroArgentino(texto, decimales)
  return n === '' ? '' : `${n}${NBSP}%`
}

/**
 * Lo que alguien escribió en un campo de importe o de porcentaje, como texto decimal con exactamente `escala` decimales
 * (`"450.000,5"` con escala 2 → `"450000.50"`), o `null` si no es un número válido o trae más decimales de los que admite la
 * columna. No admite negativos.
 *
 * Se aceptan las dos formas de escribir en la Argentina: la coma decimal (`1.234,56`, `1234,56`) y el punto decimal (`1234.56`).
 * Un punto solo es ambiguo (`450.000`: ¿450 mil o 450?): con `miles` (los importes) se lee como separador de miles cuando los
 * grupos son de tres cifras; sin `miles` (los porcentajes, que no llegan a mil) es siempre el decimal. `enteros` topa las cifras
 * de la parte entera (lo que entra en la columna: un `Numeric(14, 2)` admite 12), así un error de tipeo se avisa acá y no como un 500.
 */
export function aDecimal(
  entrada: string,
  escala: number,
  { miles = true, enteros = Infinity }: { miles?: boolean; enteros?: number } = {},
): string | null {
  let t = entrada.replace(/US\$|[\s$%]/g, '')
  if (t === '') return null
  if (t.includes(',')) {
    if ((t.match(/,/g) ?? []).length > 1) return null
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (miles && CON_PUNTOS_DE_MILES.test(t)) {
    t = t.replace(/\./g, '')
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t)
  if (!m) return null
  const fraccion = (m[2] ?? '').replace(/0+$/, '')
  if (fraccion.length > escala) return null
  const entero = m[1].replace(/^0+(?=\d)/, '')
  if (entero.length > enteros) return null
  return `${entero}${escala > 0 ? `.${fraccion.padEnd(escala, '0')}` : ''}`
}

/** Un importe de plata (`Numeric(14, 2)`: hasta 12 enteros y dos decimales) mayor que cero, como texto decimal; `null` si no lo es. */
export function importePositivo(entrada: string): string | null {
  const d = aDecimal(entrada, 2, { enteros: 12 })
  return d !== null && (aCentesimas(d) ?? 0) > 0 ? d : null
}

/** Un decimal de hasta dos cifras (`"66.67"`) en centésimas enteras (`6667`), para sumar porcentajes sin `float`. `null` si no es válido. */
export function aCentesimas(decimal: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}

/** Centésimas enteras (`10000`) a decimal (`"100.00"`). */
export function deCentesimas(centesimas: number): string {
  const entero = Math.trunc(centesimas / 100)
  return `${entero}.${String(centesimas % 100).padStart(2, '0')}`
}
