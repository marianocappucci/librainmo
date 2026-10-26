/**
 * El diálogo de las anulaciones (cuota, cobro, gasto, liquidación): pide el motivo —obligatorio, hasta 300 caracteres, como el
 * servidor— y confirma. Un rechazo del servidor (409: «el cobro ya está en una liquidación») se muestra adentro, con el motivo escrito
 * a salvo.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { CampoDeTextoLargo } from '@/components/campos'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { mensajeDeError } from '@/lib/api'

const esquema = z.object({
  motivo: z.string().trim().min(1, 'El motivo es obligatorio.').max(300, 'Hasta 300 caracteres.'),
})

type Valores = z.infer<typeof esquema>

export function DialogoDeMotivo({ abierto, titulo, descripcion, confirmar, onCerrar, onConfirmar }: {
  abierto: boolean
  titulo: string
  descripcion?: ReactNode
  /** El rótulo del botón que confirma («Anular cobro»). */
  confirmar: string
  onCerrar: () => void
  /** Hace la anulación; si tira, el error se ve en el diálogo. Si sale bien, el que llama cierra el diálogo. */
  onConfirmar: (motivo: string) => Promise<void>
}) {
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: { motivo: '' } })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ motivo: '' })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: Valores) {
    setError(null)
    try {
      await onConfirmar(v.motivo.trim())
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario abierto={abierto} onCerrar={onCerrar} titulo={titulo} descripcion={descripcion} form={form} onEnviar={enviar} error={error} enviar={confirmar}>
      <CampoDeTextoLargo control={form.control} name="motivo" etiqueta="Motivo" />
    </DialogoDeFormulario>
  )
}
