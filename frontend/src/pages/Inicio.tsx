// La pantalla de inicio: vacía hasta la fase 1 del `ROADMAP.md`.
//
// Cuando haya dominio va el tablero del mes (qué se devengó, qué se cobró, quién debe) y los
// vencimientos y renovaciones próximos. Hasta entonces dice qué producto es y nada más: una
// pantalla con números inventados sería peor que una vacía.
import { ICONOS } from 'libra-ui/iconos-identidad'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

export function Inicio() {
  return (
    <div className="space-y-3">
      <TituloPantalla icono={ICONOS.dashboard}>Inicio</TituloPantalla>
      <p className="text-muted-foreground">Administración de alquileres</p>
    </div>
  )
}
