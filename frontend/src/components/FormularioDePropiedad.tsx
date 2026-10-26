/**
 * Alta y edición de una propiedad (`app/schemas/propiedades.py`).
 *
 * Los titulares NO se cargan acá: se reemplazan juntos y suman 100 (ADR-004, punto 2), y eso se hace en la ficha, con su propio editor.
 * Después del alta la pantalla de Propiedades lleva a la ficha para cargarlos.
 *
 * «Alquilada» no se ofrece: la pone y la saca el contrato. Una propiedad que ya lo está muestra el estado, deshabilitado.
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { CampoCerrado, CampoDeTexto, CampoDeTextoLargo } from '@/components/campos'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { mensajeDeError, propiedades } from '@/lib/api'
import type { Propiedad, PropiedadEntrada } from '@/lib/api'
import {
  ESTADO_ALQUILADA, ESTADOS_DE_PROPIEDAD, ESTADOS_ELEGIBLES_DE_PROPIEDAD, TIPOS_DE_PROPIEDAD,
} from '@/lib/dominio'

const esquema = z.object({
  tipo: z.string().min(1, 'Elegí el tipo.'),
  direccion: z.string().trim().min(1, 'La dirección es obligatoria.').max(255, 'Hasta 255 caracteres.'),
  unidad: z.string().trim().max(50, 'Hasta 50 caracteres.'),
  localidad: z.string().trim().max(120, 'Hasta 120 caracteres.'),
  partida_abl: z.string().trim().max(50, 'Hasta 50 caracteres.'),
  partida_arba: z.string().trim().max(50, 'Hasta 50 caracteres.'),
  estado: z.string().min(1, 'Elegí el estado.'),
  observaciones: z.string().trim(),
})

type Valores = z.infer<typeof esquema>

const VACIO: Valores = {
  tipo: 'departamento',
  direccion: '',
  unidad: '',
  localidad: '',
  partida_abl: '',
  partida_arba: '',
  estado: 'disponible',
  observaciones: '',
}

function desdePropiedad(p: Propiedad): Valores {
  return {
    tipo: p.tipo,
    direccion: p.direccion,
    unidad: p.unidad ?? '',
    localidad: p.localidad,
    partida_abl: p.partida_abl ?? '',
    partida_arba: p.partida_arba ?? '',
    estado: p.estado,
    observaciones: p.observaciones ?? '',
  }
}

/** Lo vacío viaja como `null` (la localidad, que el backend guarda como texto, viaja vacía). */
function aEntrada(v: Valores): PropiedadEntrada {
  const o = (t: string) => t.trim() || null
  return {
    tipo: v.tipo,
    direccion: v.direccion.trim(),
    unidad: o(v.unidad),
    localidad: v.localidad.trim(),
    partida_abl: o(v.partida_abl),
    partida_arba: o(v.partida_arba),
    estado: v.estado,
    observaciones: o(v.observaciones),
  }
}

export function FormularioDePropiedad({ abierto, propiedad, onCerrar, onGuardado }: {
  abierto: boolean
  /** `null` = alta. */
  propiedad: Propiedad | null
  onCerrar: () => void
  onGuardado: (propiedad: Propiedad) => void
}) {
  const form = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: VACIO })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset(propiedad ? desdePropiedad(propiedad) : VACIO)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, propiedad])

  async function enviar(valores: Valores) {
    setError(null)
    try {
      const guardada = propiedad
        ? await propiedades.editar(propiedad.id, aEntrada(valores))
        : await propiedades.crear(aEntrada(valores))
      onGuardado(guardada)
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  const enviando = form.formState.isSubmitting
  // Alquilada la pone el contrato: no se elige, ni se cambia mientras el contrato esté vigente.
  const alquilada = propiedad?.estado === ESTADO_ALQUILADA

  return (
    <Dialog open={abierto} onOpenChange={(o) => { if (!o) onCerrar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{propiedad ? `Editar ${propiedad.codigo}` : 'Nueva propiedad'}</DialogTitle>
          <DialogDescription>
            {propiedad
              ? 'Los titulares se cambian aparte, en su propio editor de la ficha.'
              : 'Cargá la propiedad; los titulares se agregan después, en su ficha.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(enviar)} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoCerrado control={form.control} name="tipo" etiqueta="Tipo" opciones={TIPOS_DE_PROPIEDAD} />
              <CampoCerrado
                control={form.control}
                name="estado"
                etiqueta="Estado"
                opciones={alquilada ? ESTADOS_DE_PROPIEDAD : ESTADOS_ELEGIBLES_DE_PROPIEDAD}
                disabled={alquilada}
                ayuda={alquilada ? 'La pone el contrato vigente: cambia al rescindirlo o finalizarlo.' : undefined}
              />
              <CampoDeTexto control={form.control} name="direccion" etiqueta="Dirección" autoComplete="off" className="sm:col-span-2" />
              <CampoDeTexto control={form.control} name="unidad" etiqueta="Unidad" placeholder="Piso, depto., local…" autoComplete="off" />
              <CampoDeTexto control={form.control} name="localidad" etiqueta="Localidad" autoComplete="off" />
              <CampoDeTexto control={form.control} name="partida_abl" etiqueta="Partida ABL" autoComplete="off" />
              <CampoDeTexto control={form.control} name="partida_arba" etiqueta="Partida ARBA" autoComplete="off" />
            </div>
            <CampoDeTextoLargo control={form.control} name="observaciones" etiqueta="Observaciones" />
            <AvisoDeError mensaje={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
