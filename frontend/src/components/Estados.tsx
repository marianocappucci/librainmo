import { BadgeEstado } from 'libra-ui/badge-estado'

import {
  ESTADOS_DE_CONTRATO, ESTADOS_DE_PROPIEDAD, etiquetaDe, tonoDeEstadoDeContrato, tonoDeEstadoDePropiedad,
} from '@/lib/dominio'

/** La pastilla del estado de una propiedad. */
export function EstadoDePropiedad({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDePropiedad(estado)}>{etiquetaDe(ESTADOS_DE_PROPIEDAD, estado)}</BadgeEstado>
}

/** La pastilla del estado de un contrato. */
export function EstadoDeContrato({ estado }: { estado: string }) {
  return <BadgeEstado tono={tonoDeEstadoDeContrato(estado)}>{etiquetaDe(ESTADOS_DE_CONTRATO, estado)}</BadgeEstado>
}
