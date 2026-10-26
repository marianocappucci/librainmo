/**
 * Las reglas de los titulares de una propiedad que la pantalla comprueba antes de mandar la lista (el servidor las vuelve a comprobar:
 * `app/servicios/propiedades.py::fijar_titulares`). Puras, sin React, para cubrirlas con un test de tabla.
 *
 * 🔴 Los porcentajes se suman en **centésimas enteras**, no como `number` con coma: 33,33 + 33,33 + 33,34 tiene que dar 100 y con
 * `float` no siempre lo da.
 */
import { aCentesimas, aDecimal, deCentesimas, porcentaje } from '@/lib/importes'

/** 100 % en centésimas. */
export const CIEN_POR_CIENTO = 10000

/** Lo que se manda por cada fila, o por qué no se puede guardar. Pura, para que el test la cubra sin pantalla. */
export function validarTitulares(filas: { cliente_id: string; porcentaje: string }[]): {
  titulares: { cliente_id: number; porcentaje: string }[]
  total: number
  problema: string | null
} {
  const titulares: { cliente_id: number; porcentaje: string }[] = []
  let total = 0
  let problema: string | null = null
  const vistos = new Set<string>()
  filas.forEach((f, i) => {
    const n = i + 1
    const decimal = aDecimal(f.porcentaje, 2, { miles: false })
    const centesimas = decimal === null ? null : aCentesimas(decimal)
    if (!f.cliente_id) problema ??= `Elegí el titular de la fila ${n}.`
    else if (vistos.has(f.cliente_id)) problema ??= 'Un titular aparece dos veces.'
    vistos.add(f.cliente_id)
    if (decimal === null || centesimas === null) problema ??= `Escribí el porcentaje de la fila ${n} (hasta dos decimales).`
    else if (centesimas <= 0 || centesimas > CIEN_POR_CIENTO) problema ??= `El porcentaje de la fila ${n} tiene que ser mayor que 0 y no pasar de 100.`
    else {
      total += centesimas
      if (f.cliente_id) titulares.push({ cliente_id: Number(f.cliente_id), porcentaje: decimal })
    }
  })
  if (filas.length === 0) problema ??= 'La propiedad tiene que tener al menos un titular.'
  else if (total !== CIEN_POR_CIENTO) problema ??= `Los porcentajes suman ${porcentaje(deCentesimas(total))} y tienen que sumar 100 %.`
  return { titulares, total, problema }
}

