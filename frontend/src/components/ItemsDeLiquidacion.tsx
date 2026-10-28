/**
 * Los movimientos de una liquidación y sus totales: lo cobrado a favor del propietario, los gastos que se le descuentan, la comisión de
 * administración, el saldo deudor anterior si lo hay y el neto. Los usan la previsualización (nada escrito) y la ficha (emitida), con el mismo dibujo.
 *
 * 🔑 **La comisión es por contrato y sólo sobre el alquiler cobrado** (ADR-007, punto 3): cada fila de alquiler muestra su base y su
 * porcentaje; los conceptos, el punitorio y los gastos no llevan comisión. 🔸 Se toma con IVA incluido (a cerrar con el contador antes
 * de facturar): la pantalla no dice «+ IVA».
 *
 * 🔑 **El saldo deudor anterior** (ADR-011): si el propietario quedó debiendo en una liquidación anterior (neto negativo), la siguiente en esa
 * moneda lo descuenta como un ítem `saldo` —sin asiento, con el importe negativo y un enlace a la deudora— y lo suma en `saldo_anterior`.
 * Si el neto sigue negativo, esta también es deudora y el neto se rotula como saldo deudor.
 *
 * Una liquidación es de una sola moneda (`moneda`): todos los importes se imprimen con su símbolo (`$` o `US$`).
 */
import { TableFooter } from '@/components/ui/table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Link } from 'react-router-dom'

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

export function TotalesDeLiquidacionVista({ totales, moneda }: { totales: TotalesDeLiquidacion; moneda: string }) {
  const enMoneda = (importe: string) => pesos(importe, moneda)
  const conSaldoAnterior = esNegativo(totales.saldo_anterior)
  return (
    <dl className={conSaldoAnterior ? 'grid gap-3 sm:grid-cols-5' : 'grid gap-3 sm:grid-cols-4'}>
      <Cifra etiqueta="Cobrado a su favor" valor={enMoneda(totales.cobrado)} />
      <Cifra etiqueta="Gastos" valor={esNegativo(totales.gastos) || aCentesimas(totales.gastos) === 0 ? enMoneda(totales.gastos) : `-${enMoneda(totales.gastos)}`} />
      <Cifra etiqueta="Comisión" valor={aCentesimas(totales.comision) === 0 ? enMoneda(totales.comision) : `-${enMoneda(totales.comision)}`} />
      {conSaldoAnterior && <Cifra etiqueta="Saldo deudor anterior" valor={enMoneda(totales.saldo_anterior)} />}
      <Cifra etiqueta={esNegativo(totales.neto) ? 'Neto (saldo deudor)' : 'Neto a pagar'} valor={enMoneda(totales.neto)} fuerte />
    </dl>
  )
}

export function ItemsDeLiquidacion({ items, moneda }: { items: ItemDeLiquidacion[]; moneda: string }) {
  // El saldo deudor anterior no es un movimiento: se descuenta pero no se cuenta.
  const movimientos = items.filter((i) => i.tipo !== 'saldo').length
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
            // Un ítem `saldo` no tiene asiento: lo identifica la deudora de la que viene.
            <TableRow key={i.asiento_id ?? `saldo-${i.liquidacion_origen_id}`}>
              <TableCell>{fecha(i.fecha)}</TableCell>
              <TableCell>
                {i.tipo === 'saldo' && i.liquidacion_origen_id !== null ? (
                  <Link to={`/liquidaciones/${i.liquidacion_origen_id}`} className="underline underline-offset-4">
                    {i.descripcion}
                  </Link>
                ) : (
                  i.descripcion
                )}
              </TableCell>
              <TableCell className="text-right">{pesos(i.importe, moneda)}</TableCell>
              <TableCell className="text-right">
                {aCentesimas(i.base_comision) === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {pesos(i.base_comision, moneda)}
                    <div className="text-xs text-muted-foreground">al {porcentaje(i.comision_pct)}</div>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right">{aCentesimas(i.comision) === 0 ? <span className="text-muted-foreground">—</span> : pesos(i.comision, moneda)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="text-xs text-muted-foreground">
              {movimientos} {movimientos === 1 ? 'movimiento' : 'movimientos'}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}
