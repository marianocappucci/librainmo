/**
 * El historial de precios de un contrato, con «Actualizar precio».
 *
 * 🔑 **El precio anterior no se pisa** (ADR-004, punto 5): actualizar cierra el vigente el día antes y agrega una fila. La tabla muestra
 * todas, con su ventana de fechas, y quién y por qué cargó cada una.
 */
import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable } from 'libra-ui/data-table'

import { Button } from '@/components/ui/button'
import type { PrecioDelContrato } from '@/lib/api'
import { MOTIVOS_DE_PRECIO, etiquetaDe } from '@/lib/dominio'
import { fecha } from '@/lib/fechas'
import { pesos } from '@/lib/importes'

export function PreciosDelContrato({ precios, moneda, puedeActualizar, onActualizar }: {
  precios: PrecioDelContrato[]
  moneda: string
  /** Sólo un contrato vigente tiene precio con vigencia: el de un borrador se edita con el contrato. */
  puedeActualizar: boolean
  onActualizar: () => void
}) {
  const columnas = useMemo<ColumnDef<PrecioDelContrato, unknown>[]>(
    () => [
      { id: 'desde', header: 'Desde', size: 120, cell: ({ row }) => fecha(row.original.vigencia_desde) },
      {
        id: 'hasta',
        header: 'Hasta',
        size: 120,
        cell: ({ row }) => (row.original.vigencia_hasta ? fecha(row.original.vigencia_hasta) : <span className="font-medium">Vigente</span>),
      },
      { id: 'importe', header: 'Alquiler', size: 160, cell: ({ row }) => pesos(row.original.importe, moneda) },
      {
        id: 'motivo',
        header: 'Motivo',
        size: 200,
        meta: { stretch: true },
        cell: ({ row }) => etiquetaDe(MOTIVOS_DE_PRECIO, row.original.motivo),
      },
      { accessorKey: 'usuario', header: 'Cargó', size: 140 },
    ],
    [moneda],
  )

  return (
    <div className="space-y-3">
      {puedeActualizar && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onActualizar}>
            <TrendingUp className="size-4" />
            Actualizar precio
          </Button>
        </div>
      )}
      <DataTable columns={columnas} data={precios} emptyMessage="Sin precios cargados." />
    </div>
  )
}
