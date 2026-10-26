/**
 * Los diálogos de la ficha de un contrato que cambian el contrato mismo: actualizar el precio, rescindir y editar las observaciones.
 * (Garantías y conceptos tienen los suyos, junto a sus tablas.)
 *
 * Cada uno llama a su endpoint y devuelve a la ficha el contrato completo que contesta la API (`onCambio`). Un rechazo del servidor
 * —409 «el precio vigente arranca el…», 422 «la fecha de rescisión tiene que estar dentro del contrato»— se muestra adentro del
 * diálogo, sin perder lo escrito.
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { CampoDeTexto, CampoDeTextoLargo } from '@/components/campos'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { contratos, mensajeDeError } from '@/lib/api'
import type { ContratoDetalle } from '@/lib/api'
import { fecha, hoyISO } from '@/lib/fechas'
import { importePositivo, pesos } from '@/lib/importes'

type Dialogo = {
  abierto: boolean
  contrato: ContratoDetalle
  onCerrar: () => void
  /** El contrato como quedó después del cambio. */
  onCambio: (contrato: ContratoDetalle) => void
}

// ── Actualizar el precio ────────────────────────────────────────────────

const esquemaDePrecio = z
  .object({
    importe: z.string().trim().min(1, 'El nuevo alquiler es obligatorio.'),
    vigencia_desde: z.string().min(1, 'La vigencia es obligatoria.'),
  })
  .superRefine((v, ctx) => {
    if (v.importe && importePositivo(v.importe) === null) {
      ctx.addIssue({ code: 'custom', path: ['importe'], message: 'Escribí un importe mayor que cero, con hasta dos decimales.' })
    }
  })

type ValoresDePrecio = z.infer<typeof esquemaDePrecio>

export function DialogoDePrecio({ abierto, contrato, onCerrar, onCambio }: Dialogo) {
  const form = useForm<ValoresDePrecio>({ resolver: zodResolver(esquemaDePrecio), defaultValues: { importe: '', vigencia_desde: '' } })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ importe: '', vigencia_desde: hoyISO() })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: ValoresDePrecio) {
    setError(null)
    try {
      onCambio(await contratos.actualizarPrecio(contrato.id, { importe: importePositivo(v.importe) ?? '', vigencia_desde: v.vigencia_desde }))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Actualizar precio"
      descripcion={
        <>
          El alquiler vigente es {pesos(contrato.importe_vigente, contrato.moneda)} desde el {fecha(contrato.precio_vigente_desde)}. El
          nuevo precio cierra el vigente el día anterior a su vigencia; el historial no se pisa.
        </>
      }
      form={form}
      onEnviar={enviar}
      error={error}
      enviar="Actualizar precio"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoDeTexto control={form.control} name="importe" etiqueta="Nuevo alquiler" inputMode="decimal" placeholder="500.000,00" autoComplete="off" />
        <CampoDeTexto control={form.control} name="vigencia_desde" etiqueta="Rige desde" type="date" />
      </div>
    </DialogoDeFormulario>
  )
}

// ── Rescindir ───────────────────────────────────────────────────────────

const esquemaDeRescision = z.object({
  fecha: z.string().min(1, 'La fecha de rescisión es obligatoria.'),
  observaciones: z.string().trim(),
})

type ValoresDeRescision = z.infer<typeof esquemaDeRescision>

export function DialogoDeRescision({ abierto, contrato, onCerrar, onCambio }: Dialogo) {
  const form = useForm<ValoresDeRescision>({
    resolver: zodResolver(esquemaDeRescision),
    defaultValues: { fecha: '', observaciones: '' },
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ fecha: hoyISO(), observaciones: '' })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: ValoresDeRescision) {
    setError(null)
    try {
      onCambio(await contratos.rescindir(contrato.id, { fecha: v.fecha, observaciones: v.observaciones.trim() || null }))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Rescindir el contrato ${contrato.numero}`}
      descripcion={`La fecha tiene que estar dentro del contrato (${fecha(contrato.fecha_inicio)} al ${fecha(contrato.fecha_fin)}). La propiedad vuelve a «disponible» y el contrato no se puede reabrir.`}
      form={form}
      onEnviar={enviar}
      error={error}
      enviar="Rescindir contrato"
    >
      <CampoDeTexto
        control={form.control}
        name="fecha"
        etiqueta="Fecha de rescisión"
        type="date"
        min={contrato.fecha_inicio}
        max={contrato.fecha_fin}
      />
      <CampoDeTextoLargo control={form.control} name="observaciones" etiqueta="Motivo u observaciones" />
    </DialogoDeFormulario>
  )
}

// ── Editar las observaciones de un contrato vigente ─────────────────────

const esquemaDeObservaciones = z.object({ observaciones: z.string().trim() })

type ValoresDeObservaciones = z.infer<typeof esquemaDeObservaciones>

export function DialogoDeObservaciones({ abierto, contrato, onCerrar, onCambio }: Dialogo) {
  const form = useForm<ValoresDeObservaciones>({
    resolver: zodResolver(esquemaDeObservaciones),
    defaultValues: { observaciones: '' },
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ observaciones: contrato.observaciones ?? '' })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: ValoresDeObservaciones) {
    setError(null)
    try {
      onCambio(await contratos.editar(contrato.id, { observaciones: v.observaciones.trim() || null }))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Editar observaciones"
      descripcion="Un contrato vigente no cambia sus condiciones: sólo las observaciones. El alquiler se actualiza con vigencia."
      form={form}
      onEnviar={enviar}
      error={error}
    >
      <CampoDeTextoLargo control={form.control} name="observaciones" etiqueta="Observaciones" rows={5} />
    </DialogoDeFormulario>
  )
}
