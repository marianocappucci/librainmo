/**
 * Los conceptos trasladables de un contrato (expensas, ABL, seguro, servicios): lo que se cobra además del alquiler y quién lo paga.
 *
 * Un concepto sin importe es **variable** (cambia cada mes); con importe, fijo. La baja no borra: pone el concepto en inactivo y se
 * reactiva (`PUT …/conceptos/{id}` con `activo`). Un contrato rescindido o finalizado ya no los cambia.
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Ban, Pencil, Plus, Undo2 } from 'lucide-react'
import { BadgeEstado } from 'libra-ui/badge-estado'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable } from 'libra-ui/data-table'

import { CampoCerrado, CampoDeTexto } from '@/components/campos'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { BotonDeFila, columnaDeAcciones } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { contratos, mensajeDeError } from '@/lib/api'
import type { ConceptoDelContrato, ContratoDetalle } from '@/lib/api'
import { PAGADORES, TIPOS_DE_CONCEPTO, etiquetaDe } from '@/lib/dominio'
import { importePositivo, numeroArgentino, pesos } from '@/lib/importes'

const esquema = z
  .object({
    concepto: z.string().min(1, 'Elegí el concepto.'),
    paga: z.string().min(1, 'Elegí quién lo paga.'),
    descripcion: z.string().trim().max(120, 'Hasta 120 caracteres.'),
    importe: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.importe && importePositivo(v.importe) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['importe'],
        message: 'Escribí un importe mayor que cero, con hasta dos decimales; o dejalo vacío si es variable.',
      })
    }
  })

type Valores = z.infer<typeof esquema>

const VACIO: Valores = { concepto: 'expensas', paga: 'inquilino', descripcion: '', importe: '' }

function DialogoDeConcepto({ abierto, contrato, concepto, onCerrar, onCambio }: {
  abierto: boolean
  contrato: ContratoDetalle
  /** El concepto a editar; `null` = alta. */
  concepto: ConceptoDelContrato | null
  onCerrar: () => void
  onCambio: (contrato: ContratoDetalle) => void
}) {
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: VACIO })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset(
      concepto
        ? {
            concepto: concepto.concepto,
            paga: concepto.paga,
            descripcion: concepto.descripcion,
            importe: numeroArgentino(concepto.importe, 2),
          }
        : VACIO,
    )
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, concepto])

  async function enviar(v: Valores) {
    setError(null)
    const importe = v.importe ? importePositivo(v.importe) : null
    try {
      onCambio(
        concepto
          ? await contratos.cambiarConcepto(contrato.id, concepto.id, { descripcion: v.descripcion.trim(), paga: v.paga, importe })
          : await contratos.agregarConcepto(contrato.id, { concepto: v.concepto, descripcion: v.descripcion.trim(), paga: v.paga, importe }),
      )
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={concepto ? `Editar ${etiquetaDe(TIPOS_DE_CONCEPTO, concepto.concepto)}` : 'Agregar concepto'}
      descripcion="Lo que se cobra además del alquiler. Sin importe, el concepto es variable: cambia cada mes."
      form={form}
      onEnviar={enviar}
      error={error}
      enviar={concepto ? 'Guardar' : 'Agregar concepto'}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoCerrado control={form.control} name="concepto" etiqueta="Concepto" opciones={TIPOS_DE_CONCEPTO} disabled={concepto !== null} />
        <CampoCerrado control={form.control} name="paga" etiqueta="Quién paga" opciones={PAGADORES} />
        <CampoDeTexto control={form.control} name="descripcion" etiqueta="Descripción" placeholder="Opcional" autoComplete="off" />
        <CampoDeTexto
          control={form.control}
          name="importe"
          etiqueta={`Importe (${contrato.moneda})`}
          inputMode="decimal"
          placeholder="Variable"
          autoComplete="off"
        />
      </div>
    </DialogoDeFormulario>
  )
}

export function ConceptosDelContrato({ contrato, puedeCambiar, onCambio, onError }: {
  contrato: ContratoDetalle
  /** Un contrato rescindido o finalizado ya no cambia sus conceptos. */
  puedeCambiar: boolean
  onCambio: (contrato: ContratoDetalle) => void
  /** Un rechazo del servidor al dar de baja o reactivar se muestra arriba de la ficha. */
  onError: (mensaje: string) => void
}) {
  // `undefined` = diálogo cerrado; `null` = alta; un concepto = edición.
  const [dialogo, setDialogo] = useState<ConceptoDelContrato | null | undefined>(undefined)

  async function alternar(c: ConceptoDelContrato) {
    try {
      onCambio(await contratos.cambiarConcepto(contrato.id, c.id, { activo: !c.activo }))
    } catch (e) {
      onError(mensajeDeError(e))
    }
  }

  const columnas = useMemo<ColumnDef<ConceptoDelContrato, unknown>[]>(() => {
    const base: ColumnDef<ConceptoDelContrato, unknown>[] = [
      { id: 'concepto', header: 'Concepto', size: 150, cell: ({ row }) => etiquetaDe(TIPOS_DE_CONCEPTO, row.original.concepto) },
      {
        id: 'descripcion',
        header: 'Descripción',
        size: 200,
        meta: { stretch: true },
        cell: ({ row }) => row.original.descripcion || '—',
      },
      { id: 'paga', header: 'Quién paga', size: 190, cell: ({ row }) => etiquetaDe(PAGADORES, row.original.paga) },
      {
        id: 'importe',
        header: 'Importe',
        size: 150,
        cell: ({ row }) =>
          row.original.importe === null ? (
            <span className="text-muted-foreground">Variable</span>
          ) : (
            pesos(row.original.importe, contrato.moneda)
          ),
      },
      {
        id: 'estado',
        header: 'Estado',
        size: 110,
        cell: ({ row }) => (
          <BadgeEstado tono={row.original.activo ? 'ok' : 'neutro'}>{row.original.activo ? 'Activo' : 'De baja'}</BadgeEstado>
        ),
      },
    ]
    if (!puedeCambiar) return base
    return [
      ...base,
      columnaDeAcciones<ConceptoDelContrato>({
        botones: 2,
        celda: (c) => {
          const nombre = etiquetaDe(TIPOS_DE_CONCEPTO, c.concepto)
          return (
            <>
              <BotonDeFila titulo="Editar concepto" fila={nombre} onClick={() => setDialogo(c)}>
                <Pencil className="size-4" />
              </BotonDeFila>
              <BotonDeFila titulo={c.activo ? 'Dar de baja el concepto' : 'Reactivar el concepto'} fila={nombre} onClick={() => void alternar(c)}>
                {c.activo ? <Ban className="size-4" /> : <Undo2 className="size-4" />}
              </BotonDeFila>
            </>
          )
        },
      }),
    ]
    // `alternar` y `contrato` cambian con cada respuesta; las columnas se rearman con ellos.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeCambiar, contrato])

  return (
    <div className="space-y-3">
      {puedeCambiar && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setDialogo(null)}>
            <Plus className="size-4" />
            Agregar concepto
          </Button>
        </div>
      )}
      <DataTable
        columns={columnas}
        data={contrato.conceptos}
        getRowClassName={(c) => (c.activo ? undefined : 'opacity-50')}
        emptyMessage="Sin conceptos cargados."
      />
      <DialogoDeConcepto
        abierto={dialogo !== undefined}
        contrato={contrato}
        concepto={dialogo ?? null}
        onCerrar={() => setDialogo(undefined)}
        onCambio={(c) => {
          setDialogo(undefined)
          onCambio(c)
        }}
      />
    </div>
  )
}
