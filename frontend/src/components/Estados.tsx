import { BadgeEstado } from 'libra-ui/badge-estado'

import {
  ESTADOS_DE_CONTRATO, ESTADOS_DE_CUOTA, ESTADOS_DE_LIQUIDACION, ESTADOS_DE_PROPIEDAD, conPagosACuenta, etiquetaDe, tonoDeEstadoDeContrato,
  tonoDeEstadoDeCuota, tonoDeEstadoDeLiquidacion, tonoDeEstadoDePropiedad,
} from '@/lib/dominio'
import { pesos } from '@/lib/importes'

/** La pastilla del estado de una propiedad. */
export function EstadoDePropiedad({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDePropiedad(estado)}>{etiquetaDe(ESTADOS_DE_PROPIEDAD, estado)}</BadgeEstado>
}

/** La pastilla del estado de un contrato. */
export function EstadoDeContrato({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDeContrato(estado)}>{etiquetaDe(ESTADOS_DE_CONTRATO, estado)}</BadgeEstado>
}

/** La pastilla del estado de una cuota. */
export function EstadoDeCuota({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDeCuota(estado)}>{etiquetaDe(ESTADOS_DE_CUOTA, estado)}</BadgeEstado>
}

/** La pastilla del estado de una cuota; una pendiente con pagos a cuenta (ADR-010) dice además cuánto falta: «Pendiente · saldo $ 162.500,50». */
export function EstadoDeCuotaConSaldo({ cuota }: { cuota: { estado: string; cobros: readonly number[]; saldo: string; moneda: string } }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <EstadoDeCuota estado={cuota.estado} />
      {conPagosACuenta(cuota) && <span className="text-xs text-muted-foreground">· saldo {pesos(cuota.saldo, cuota.moneda)}</span>}
    </span>
  )
}

/** La pastilla del estado de una liquidación. */
export function EstadoDeLiquidacion({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDeLiquidacion(estado)}>{etiquetaDe(ESTADOS_DE_LIQUIDACION, estado)}</BadgeEstado>
}

/** Un cobro, un gasto o una liquidación anulados se ven como tales, no desaparecen del listado cuando se piden. */
export function Anulado() {
  return <BadgeEstado tono="neutro">Anulado</BadgeEstado>
}
