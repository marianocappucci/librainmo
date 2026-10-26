/** Lo que las pantallas de listado y de detalle repiten: el aviso de error y la columna de acciones de una tabla. */
import type { ReactNode } from 'react'
import type { ColumnDef, RowData } from 'libra-ui/data-table'
import { anchoColumnaAcciones } from 'libra-ui/data-table'

import { Button } from '@/components/ui/button'

/** El error de la API, arriba de la tabla o dentro del diálogo.
 *
 *  `role="alert"` para que un lector de pantalla lo anuncie sin que haya que ir a buscarlo: aparece después de una acción, y quien la
 *  disparó puede tener el foco en otro lado. */
export function AvisoDeError({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {mensaje}
    </p>
  )
}

/** Un botón de la columna de acciones de una fila: de ícono, con borde, y con el nombre de la fila en el `aria-label`.
 *
 *  🔑 «Editar Expensas», no un «Editar» pelado: con 40 filas, un lector de pantalla anuncia 40 botones idénticos y no hay forma de saber cuál
 *  es cuál. */
export function BotonDeFila({ titulo, fila, onClick, children }: {
  titulo: string
  /** Cómo se nombra la fila: va en el `aria-label` (`${titulo} ${fila}`). */
  fila: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button variant="outline" size="icon" title={titulo} aria-label={`${titulo} ${fila}`} onClick={onClick}>
      {children}
    </Button>
  )
}

const ANCHO_MINIMO_DEL_TITULO = 100

/** La columna de acciones, al extremo derecho.
 *
 *  🔑 **Lleva título y los botones llevan borde**, que es la convención de la familia (`acciones-normalizadas.test.ts`): una columna sin
 *  encabezado en una tabla que sí lo tiene en todas las demás, y dos íconos sueltos sin nada que los delimite, es como diverge. El `size`
 *  sale de `anchoColumnaAcciones` del kit y no de un número escrito acá. */
export function columnaDeAcciones<T extends RowData>({ botones, celda }: {
  /** Cuántos botones como máximo: dimensiona la columna. */
  botones: number
  celda: (fila: T) => ReactNode
}): ColumnDef<T, unknown> {
  return {
    id: 'acciones',
    header: () => <div className="text-right">Acciones</div>,
    // Nunca menos de lo que ocupa la palabra «Acciones» en el encabezado: con un solo botón la columna medía 52 px y el título se cortaba.
    size: Math.max(anchoColumnaAcciones(botones), ANCHO_MINIMO_DEL_TITULO),
    // Sin ordenar ni buscar: no hay dato acá.
    enableSorting: false,
    cell: ({ row }: { row: { original: T } }) => <div className="flex justify-end gap-1">{celda(row.original)}</div>,
  } as ColumnDef<T, unknown>
}
