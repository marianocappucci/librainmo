/**
 * El marco de los diálogos con un formulario chico (precio, rescisión, garantía, concepto, observaciones): título, descripción, el error
 * del servidor adentro —con lo cargado a salvo— y «Cancelar» / «Guardar».
 *
 * Cada diálogo trae su propio `useForm` y sus campos; esto sólo evita repetir el marco.
 */
import type { ReactNode } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'

import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'

export function DialogoDeFormulario<T extends FieldValues>({
  abierto, onCerrar, titulo, descripcion, form, onEnviar, error, enviar = 'Guardar', children,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  descripcion?: ReactNode
  form: UseFormReturn<T>
  onEnviar: (valores: T) => Promise<void>
  /** El error del servidor, que se muestra adentro del diálogo. */
  error: string | null
  /** El rótulo del botón que confirma. */
  enviar?: string
  children: ReactNode
}) {
  const enviando = form.formState.isSubmitting
  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onEnviar)} className="space-y-3" noValidate>
            {children}
            <AvisoDeError mensaje={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Guardando…' : enviar}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
