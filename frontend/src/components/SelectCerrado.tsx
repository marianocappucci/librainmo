/**
 * Un desplegable de lista CERRADA: pocas opciones fijas del código (tipo, estado, moneda, método de ajuste), no datos que llegan de
 * la API.
 *
 * Existe para que la excepción a «todo desplegable de datos se busca escribiendo» (`selects-buscables.test.ts`, ADR-039 de
 * libra-ui) viva en UN solo renglón con su motivo, y no repartida por cada formulario. Todo lo que viene de la API (propiedades,
 * clientes) usa `SelectBuscable`.
 *
 * Acepta las props que un `<FormControl>` de shadcn le inyecta al hijo (`id`, `aria-invalid`, `aria-describedby`): sin ellas el
 * campo quedaría sin nombre accesible aun dentro de un formulario con su etiqueta puesta.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type OpcionCerrada = { value: string; label: string }

export function SelectCerrado({
  value, onChange, opciones, ariaLabel, placeholder, id, className, disabled, ...aria
}: {
  value: string
  onChange: (valor: string) => void
  opciones: readonly OpcionCerrada[]
  ariaLabel?: string
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  return (
    // select-cerrado: opciones fijas del código (tipos, estados, monedas); los desplegables de datos usan SelectBuscable
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={className} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
