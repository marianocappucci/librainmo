/**
 * «Cargar un cargo» en una cuota pendiente (`POST /api/cuotas/{id}/lineas`): las expensas del mes que llegaron después de generarla, o
 * un cargo suelto con su descripción.
 *
 * Los conceptos que se ofrecen son los del contrato que paga el inquilino, están activos y todavía no están en esta cuota (el servidor
 * rechaza repetir uno: 409). «Cargo suelto» es la salida para lo que no es ninguno de ellos y pide descripción.
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { CampoBuscable, CampoDeTexto } from '@/components/campos'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { cuotas, mensajeDeError } from '@/lib/api'
import type { ConceptoDelContrato, Cuota } from '@/lib/api'
import { TIPOS_DE_CONCEPTO, etiquetaDe } from '@/lib/dominio'
import { importePositivo, pesos } from '@/lib/importes'

/** El valor de «cargo suelto» en el desplegable (un id de concepto nunca es esto). */
const SUELTO = 'suelto'

const esquema = z
  .object({
    concepto: z.string().min(1, 'Elegí el concepto o «cargo suelto».'),
    descripcion: z.string().trim().max(160, 'Hasta 160 caracteres.'),
    importe: z.string().trim().min(1, 'El importe es obligatorio.'),
  })
  .superRefine((v, ctx) => {
    if (v.concepto === SUELTO && !v.descripcion) {
      ctx.addIssue({ code: 'custom', path: ['descripcion'], message: 'Un cargo suelto lleva descripción.' })
    }
    if (v.importe && importePositivo(v.importe) === null) {
      ctx.addIssue({ code: 'custom', path: ['importe'], message: 'Escribí un importe mayor que cero, con hasta dos decimales.' })
    }
  })

type Valores = z.infer<typeof esquema>

export function DialogoDeCargo({ abierto, cuota, conceptos, moneda, onCerrar, onCambio }: {
  abierto: boolean
  cuota: Cuota
  /** Los conceptos del contrato. */
  conceptos: ConceptoDelContrato[]
  moneda: string
  onCerrar: () => void
  onCambio: (cuota: Cuota) => void
}) {
  const disponibles = useMemo(
    () => conceptos.filter((c) => c.activo && c.paga === 'inquilino' && !cuota.lineas.some((l) => l.concepto_id === c.id)),
    [conceptos, cuota.lineas],
  )
  const opciones = useMemo(
    () => [
      ...disponibles.map((c) => ({
        value: String(c.id),
        label: c.descripcion || etiquetaDe(TIPOS_DE_CONCEPTO, c.concepto),
        hint: c.importe === null ? 'variable' : `fijo ${pesos(c.importe, moneda)}`,
      })),
      { value: SUELTO, label: 'Cargo suelto' },
    ],
    [disponibles, moneda],
  )
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: { concepto: SUELTO, descripcion: '', importe: '' } })
  const [error, setError] = useState<string | null>(null)
  const concepto = form.watch('concepto')

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ concepto: disponibles[0] ? String(disponibles[0].id) : SUELTO, descripcion: '', importe: '' })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: Valores) {
    setError(null)
    try {
      const suelto = v.concepto === SUELTO
      onCambio(
        await cuotas.agregarLinea(cuota.id, {
          importe: importePositivo(v.importe) ?? '',
          concepto_id: suelto ? null : Number(v.concepto),
          descripcion: v.descripcion || null,
        }),
      )
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cargar un cargo"
      descripcion="Se suma a la cuota y al cargo de la cuenta del inquilino. Sólo se puede mientras la cuota está pendiente."
      form={form}
      onEnviar={enviar}
      error={error}
      enviar="Cargar el cargo"
    >
      <CampoBuscable control={form.control} name="concepto" etiqueta="Concepto" opciones={opciones} placeholder="Buscar concepto…" />
      <CampoDeTexto
        control={form.control}
        name="descripcion"
        etiqueta="Descripción"
        placeholder={concepto === SUELTO ? 'Obligatoria' : 'Opcional: el concepto ya tiene la suya'}
        autoComplete="off"
      />
      <CampoDeTexto control={form.control} name="importe" etiqueta={`Importe (${moneda})`} inputMode="decimal" placeholder="18.500,00" autoComplete="off" />
    </DialogoDeFormulario>
  )
}
