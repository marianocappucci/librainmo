import { BadgeEstado } from 'libra-ui/badge-estado'

import {
  ESTADOS_DE_CONTRATO, ESTADOS_DE_CUOTA, ESTADOS_DE_LIQUIDACION, ESTADOS_DE_PROPIEDAD, etiquetaDe, tonoDeEstadoDeContrato,
  tonoDeEstadoDeCuota, tonoDeEstadoDeLiquidacion, tonoDeEstadoDePropiedad,
} from '@/lib/dominio'

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

/** La pastilla del estado de una liquidación. */
export function EstadoDeLiquidacion({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDeLiquidacion(estado)}>{etiquetaDe(ESTADOS_DE_LIQUIDACION, estado)}</BadgeEstado>
}

/** Un cobro, un gasto o una liquidación anulados se ven como tales, no desaparecen del listado cuando se piden. */
export function Anulado() {
  return <BadgeEstado tono="neutro">Anulado</BadgeEstado>
}
