/**
 * El alta de un gasto por cuenta del propietario (`POST /api/gastos`): una reparación, un impuesto que la inmobiliaria pagó con la plata
 * del propietario. Se reparte entre los titulares de la propiedad por su porcentaje y se descuenta en su próxima liquidación (ADR-007).
 *
 * Si la propiedad no tiene sus titulares completos (suman menos de 100 %), el servidor lo rechaza (409: «no hay a quién cargarle el
 * gasto») y el motivo se ve adentro del diálogo, con lo escrito a salvo.
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { CampoBuscable, CampoCerrado, CampoDeTexto } from '@/components/campos'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { gastos, mensajeDeError } from '@/lib/api'
import type { Gasto, Propiedad } from '@/lib/api'
import { CATEGORIAS_DE_GASTO, MONEDAS, direccionCompleta } from '@/lib/dominio'
import { hoyISO } from '@/lib/fechas'
import { importePositivo } from '@/lib/importes'

const esquema = z
  .object({
    propiedad_id: z.string().min(1, 'Elegí la propiedad.'),
    fecha: z.string().min(1, 'La fecha es obligatoria.'),
    categoria: z.string().min(1, 'Elegí la categoría.'),
    descripcion: z.string().trim().min(1, 'La descripción es obligatoria.').max(200, 'Hasta 200 caracteres.'),
    importe: z.string().trim().min(1, 'El importe es obligatorio.'),
    moneda: z.string().min(1),
    comprobante: z.string().trim().max(80, 'Hasta 80 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.importe && importePositivo(v.importe) === null) {
      ctx.addIssue({ code: 'custom', path: ['importe'], message: 'Escribí un importe mayor que cero, con hasta dos decimales.' })
    }
  })

type Valores = z.infer<typeof esquema>

const VACIO: Valores = { propiedad_id: '', fecha: '', categoria: 'reparacion', descripcion: '', importe: '', moneda: 'ARS', comprobante: '' }

export function FormularioDeGasto({ abierto, propiedades, onCerrar, onGuardado }: {
  abierto: boolean
  /** Las propiedades entre las que elegir (de la API). */
  propiedades: Propiedad[]
  onCerrar: () => void
  onGuardado: (gasto: Gasto) => void
}) {
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: VACIO })
  const [error, setError] = useState<string | null>(null)
  const opciones = useMemo(
    () => propiedades.map((p) => ({ value: String(p.id), label: `${p.codigo} · ${direccionCompleta(p)}` })),
    [propiedades],
  )

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ ...VACIO, fecha: hoyISO() })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: Valores) {
    setError(null)
    try {
      onGuardado(
        await gastos.registrar({
          propiedad_id: Number(v.propiedad_id),
          fecha: v.fecha,
          categoria: v.categoria,
          descripcion: v.descripcion.trim(),
          importe: importePositivo(v.importe) ?? '',
          moneda: v.moneda,
          comprobante: v.comprobante.trim() || null,
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
      titulo="Nuevo gasto"
      descripcion="Lo que la inmobiliaria pagó por cuenta del propietario. Se reparte entre los titulares de la propiedad y se descuenta en su próxima liquidación, en la misma moneda."
      form={form}
      onEnviar={enviar}
      error={error}
      enviar="Registrar el gasto"
    >
      <CampoBuscable control={form.control} name="propiedad_id" etiqueta="Propiedad" opciones={opciones} placeholder="Buscar por código o dirección…" />
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoDeTexto control={form.control} name="fecha" etiqueta="Fecha" type="date" />
        <CampoCerrado control={form.control} name="categoria" etiqueta="Categoría" opciones={CATEGORIAS_DE_GASTO} />
      </div>
      <CampoDeTexto control={form.control} name="descripcion" etiqueta="Descripción" placeholder="Cambio de la bomba de agua" autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoCerrado control={form.control} name="moneda" etiqueta="Moneda" opciones={MONEDAS} />
        <CampoDeTexto control={form.control} name="importe" etiqueta="Importe" inputMode="decimal" placeholder="85.000,00" autoComplete="off" />
        <CampoDeTexto control={form.control} name="comprobante" etiqueta="Comprobante" placeholder="N° de factura o recibo" autoComplete="off" />
      </div>
    </DialogoDeFormulario>
  )
}
