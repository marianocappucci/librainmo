/**
 * Los movimientos de una liquidación y sus cuatro totales: lo cobrado a favor del propietario, los gastos que se le descuentan, la
 * comisión de administración y el neto. Los usan la previsualización (nada escrito) y la ficha (emitida), con el mismo dibujo.
 *
 * 🔑 **La comisión es por contrato y sólo sobre el alquiler cobrado** (ADR-007, punto 3): cada fila de alquiler muestra su base y su
 * porcentaje; los conceptos, el punitorio y los gastos no llevan comisión. 🔸 Se toma con IVA incluido (a cerrar con el contador antes
 * de facturar): la pantalla no dice «+ IVA».
 */
import { TableFooter } from '@/components/ui/table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ItemDeLiquidacion, TotalesDeLiquidacion } from '@/lib/api'
import { fecha } from '@/lib/fechas'
import { aCentesimas, esNegativo, pesos, porcentaje } from '@/lib/importes'

function Cifra({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={fuerte ? 'text-base font-semibold' : 'text-sm'}>{valor}</dd>
    </div>
  )
}

export function TotalesDeLiquidacionVista({ totales }: { totales: TotalesDeLiquidacion }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-4">
      <Cifra etiqueta="Cobrado a su favor" valor={pesos(totales.cobrado)} />
      <Cifra etiqueta="Gastos" valor={esNegativo(totales.gastos) || aCentesimas(totales.gastos) === 0 ? pesos(totales.gastos) : `-${pesos(totales.gastos)}`} />
      <Cifra etiqueta="Comisión" valor={aCentesimas(totales.comision) === 0 ? pesos(totales.comision) : `-${pesos(totales.comision)}`} />
      <Cifra etiqueta="Neto a pagar" valor={pesos(totales.neto)} fuerte />
    </dl>
  )
}

export function ItemsDeLiquidacion({ items }: { items: ItemDeLiquidacion[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Movimiento</TableHead>
            <TableHead className="text-right">Importe</TableHead>
            <TableHead className="text-right">Base de la comisión</TableHead>
            <TableHead className="text-right">Comisión</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.asiento_id}>
              <TableCell>{fecha(i.fecha)}</TableCell>
              <TableCell>{i.descripcion}</TableCell>
              <TableCell className="text-right">{pesos(i.importe)}</TableCell>
              <TableCell className="text-right">
                {aCentesimas(i.base_comision) === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {pesos(i.base_comision)}
                    <div className="text-xs text-muted-foreground">al {porcentaje(i.comision_pct)}</div>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right">{aCentesimas(i.comision) === 0 ? <span className="text-muted-foreground">—</span> : pesos(i.comision)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? 'movimiento' : 'movimientos'}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
