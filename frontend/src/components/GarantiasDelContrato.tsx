/**
 * Las garantías de un contrato: alta y baja. Un contrato rescindido o finalizado ya no las cambia (el servidor lo rechaza).
 *
 * El garante es `SelectCliente` con alta en el lugar (ADR-071). El seguro de caución no tiene una persona detrás, así que no lo pide.
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { SelectCliente } from 'libra-ui/SelectCliente'
import { CAMPOS_CLIENTE_DEL_MOTOR } from 'libra-ui/comercio/alta-de-cliente'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable } from 'libra-ui/data-table'

import { CampoCerrado, CampoDeTexto } from '@/components/campos'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { BotonDeFila, columnaDeAcciones } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useClientes } from '@/hooks/use-clientes'
import { contratos, mensajeDeError } from '@/lib/api'
import type { ContratoDetalle, GarantiaDelContrato } from '@/lib/api'
import { GARANTIA_SIN_GARANTE, TIPOS_DE_GARANTIA, etiquetaDe } from '@/lib/dominio'
import { fecha } from '@/lib/fechas'

const esquema = z.object({
  tipo: z.string().min(1, 'Elegí el tipo de garantía.'),
  garante_id: z.string(),
  descripcion: z.string().trim().max(500, 'Hasta 500 caracteres.'),
  vence: z.string(),
})

type Valores = z.infer<typeof esquema>

const VACIO: Valores = { tipo: 'propietaria', garante_id: '', descripcion: '', vence: '' }

function DialogoDeGarantia({ abierto, contrato, onCerrar, onCambio }: {
  abierto: boolean
  contrato: ContratoDetalle
  onCerrar: () => void
  onCambio: (contrato: ContratoDetalle) => void
}) {
  const { opciones, crear, error: errorDeClientes } = useClientes()
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: VACIO })
  const [error, setError] = useState<string | null>(null)
  const tipo = form.watch('tipo')

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset(VACIO)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: Valores) {
    setError(null)
    try {
      const conGarante = v.tipo !== GARANTIA_SIN_GARANTE && v.garante_id !== ''
      onCambio(
        await contratos.agregarGarantia(contrato.id, {
          tipo: v.tipo,
          garante_id: conGarante ? Number(v.garante_id) : null,
          descripcion: v.descripcion.trim() || null,
          vence: v.vence || null,
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
      titulo="Agregar garantía"
      descripcion="El garante es un cliente: si todavía no está cargado, agregalo desde el mismo campo."
      form={form}
      onEnviar={enviar}
      error={error ?? errorDeClientes}
      enviar="Agregar garantía"
    >
      <CampoCerrado control={form.control} name="tipo" etiqueta="Tipo de garantía" opciones={TIPOS_DE_GARANTIA} />
      {tipo !== GARANTIA_SIN_GARANTE && (
        <FormField
          control={form.control}
          name="garante_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Garante</FormLabel>
              <FormControl>
                <SelectCliente
                  value={field.value}
                  onChange={field.onChange}
                  opciones={opciones}
                  placeholder="Buscar garante…"
                  ariaLabel="Garante"
                  entidad="garante"
                  campos={CAMPOS_CLIENTE_DEL_MOTOR}
                  crear={crear}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <CampoDeTexto
        control={form.control}
        name="descripcion"
        etiqueta="Descripción"
        placeholder="Inmueble, póliza, empleador…"
        autoComplete="off"
      />
      <CampoDeTexto control={form.control} name="vence" etiqueta="Vence" type="date" ayuda="Opcional." />
    </DialogoDeFormulario>
  )
}

export function GarantiasDelContrato({ contrato, puedeCambiar, onCambio, onError }: {
  contrato: ContratoDetalle
  /** Un contrato rescindido o finalizado ya no cambia sus garantías. */
  puedeCambiar: boolean
  onCambio: (contrato: ContratoDetalle) => void
  /** Un rechazo del servidor al quitar una garantía se muestra arriba de la ficha. */
  onError: (mensaje: string) => void
}) {
  const [agregando, setAgregando] = useState(false)
  const [aQuitar, setAQuitar] = useState<GarantiaDelContrato | null>(null)

  const columnas = useMemo<ColumnDef<GarantiaDelContrato, unknown>[]>(() => {
    const base: ColumnDef<GarantiaDelContrato, unknown>[] = [
      { id: 'tipo', header: 'Tipo', size: 190, cell: ({ row }) => etiquetaDe(TIPOS_DE_GARANTIA, row.original.tipo) },
      { id: 'garante', header: 'Garante', size: 200, cell: ({ row }) => row.original.garante_nombre || '—' },
      {
        id: 'descripcion',
        header: 'Descripción',
        size: 220,
        meta: { stretch: true },
        cell: ({ row }) => row.original.descripcion || '—',
      },
      { id: 'vence', header: 'Vence', size: 120, cell: ({ row }) => (row.original.vence ? fecha(row.original.vence) : '—') },
    ]
    if (!puedeCambiar) return base
    return [
      ...base,
      columnaDeAcciones<GarantiaDelContrato>({
        botones: 1,
        celda: (g) => (
          <BotonDeFila titulo="Quitar garantía" fila={etiquetaDe(TIPOS_DE_GARANTIA, g.tipo)} onClick={() => setAQuitar(g)}>
            <Trash2 className="size-4" />
          </BotonDeFila>
        ),
      }),
    ]
  }, [puedeCambiar])

  async function quitar(g: GarantiaDelContrato) {
    try {
      onCambio(await contratos.quitarGarantia(contrato.id, g.id))
    } catch (e) {
      onError(mensajeDeError(e))
    }
  }

  return (
    <div className="space-y-3">
      {puedeCambiar && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
            <Plus className="size-4" />
            Agregar garantía
          </Button>
        </div>
      )}
      <DataTable columns={columnas} data={contrato.garantias} emptyMessage="Sin garantías cargadas." />

      {agregando && (
        <DialogoDeGarantia
          abierto
          contrato={contrato}
          onCerrar={() => setAgregando(false)}
          onCambio={(c) => {
            setAgregando(false)
            onCambio(c)
          }}
        />
      )}
      <ConfirmDialog
        open={aQuitar !== null}
        onOpenChange={(o) => { if (!o) setAQuitar(null) }}
        title={aQuitar ? `¿Quitar la garantía «${etiquetaDe(TIPOS_DE_GARANTIA, aQuitar.tipo)}»?` : ''}
        description={aQuitar?.garante_nombre ? `Garante: ${aQuitar.garante_nombre}.` : undefined}
        confirmLabel="Quitar garantía"
        onConfirm={() => {
          if (aQuitar) void quitar(aQuitar)
          setAQuitar(null)
        }}
      />
    </div>
  )
}
