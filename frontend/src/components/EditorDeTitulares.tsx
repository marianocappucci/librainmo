/**
 * El editor de los titulares de una propiedad: quién es el dueño y en qué porcentaje.
 *
 * 🔑 **La lista se guarda ENTERA y tiene que sumar 100** (ADR-004, punto 2; `PUT /api/propiedades/{id}/titulares`). Cargar de a uno deja
 * estados intermedios (60 % de dueño) que la liquidación no sabría repartir, así que el botón no se habilita hasta que cada fila tiene
 * su titular y su porcentaje, ninguno se repite y el total es 100. El total se ve siempre.
 *
 * 🔴 **Los porcentajes no pasan por `number`**: se suman en centésimas enteras (`aCentesimas`) y se mandan como texto decimal.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SelectCliente } from 'libra-ui/SelectCliente'
import { CAMPOS_CLIENTE_DEL_MOTOR } from 'libra-ui/comercio/alta-de-cliente'
import { BadgeEstado } from 'libra-ui/badge-estado'

import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClientes } from '@/hooks/use-clientes'
import { mensajeDeError, propiedades } from '@/lib/api'
import type { Propiedad } from '@/lib/api'
import { deCentesimas, numeroArgentino, porcentaje } from '@/lib/importes'
import { CIEN_POR_CIENTO, validarTitulares } from '@/lib/titulares'

type Fila = { clave: number; cliente_id: string; porcentaje: string }

let siguienteClave = 1
const filaVacia = (): Fila => ({ clave: siguienteClave++, cliente_id: '', porcentaje: '' })

function filasDe(p: Propiedad): Fila[] {
  if (p.titulares.length === 0) return [filaVacia()]
  return p.titulares.map((t) => ({
    clave: siguienteClave++,
    cliente_id: String(t.cliente_id),
    porcentaje: numeroArgentino(t.porcentaje, 2),
  }))
}

export function EditorDeTitulares({ propiedad, onGuardado }: {
  propiedad: Propiedad
  onGuardado: (propiedad: Propiedad) => void
}) {
  const { opciones: deLaApi, crear, error: errorDeClientes } = useClientes()
  // Los titulares ya cargados se ven con su nombre desde el primer cuadro, antes de que llegue la lista de clientes.
  const opciones = useMemo(() => {
    const conocidos = new Set(deLaApi.map((o) => o.value))
    const propios = propiedad.titulares
      .filter((t) => !conocidos.has(String(t.cliente_id)))
      .map((t) => ({ value: String(t.cliente_id), label: t.nombre }))
    return [...deLaApi, ...propios]
  }, [deLaApi, propiedad.titulares])
  const [filas, setFilas] = useState<Fila[]>(() => filasDe(propiedad))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  // Después de guardar (o al cambiar de propiedad) el editor vuelve a lo que dice el servidor.
  useEffect(() => {
    setFilas(filasDe(propiedad))
  }, [propiedad])

  const { titulares, total, problema } = useMemo(() => validarTitulares(filas), [filas])

  function cambiar(clave: number, parcial: Partial<Fila>) {
    setGuardado(false)
    setFilas((previas) => previas.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)))
  }

  async function guardar() {
    if (problema) return
    setGuardando(true)
    setError(null)
    try {
      const actualizada = await propiedades.fijarTitulares(propiedad.id, titulares)
      onGuardado(actualizada)
      setGuardado(true)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {filas.map((f, i) => {
          const n = i + 1
          // Los que ya están en otra fila no se ofrecen: un titular no se repite.
          const enOtras = new Set(filas.filter((o) => o.clave !== f.clave).map((o) => o.cliente_id))
          return (
            <li key={f.clave} className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-64 flex-1 gap-1.5">
                <span className="text-xs text-muted-foreground">Titular {n}</span>
                <SelectCliente
                  value={f.cliente_id}
                  onChange={(v) => cambiar(f.clave, { cliente_id: v })}
                  opciones={opciones.map((o) => (enOtras.has(o.value) ? { ...o, disabled: true } : o))}
                  placeholder="Buscar titular…"
                  ariaLabel={`Titular ${n}`}
                  entidad="titular"
                  campos={CAMPOS_CLIENTE_DEL_MOTOR}
                  crear={crear}
                />
              </div>
              <div className="grid w-32 gap-1.5">
                <label htmlFor={`porcentaje-titular-${f.clave}`} className="text-xs text-muted-foreground">
                  Porcentaje {n}
                </label>
                <div className="flex items-center gap-1">
                  <Input
                    id={`porcentaje-titular-${f.clave}`}
                    inputMode="decimal"
                    value={f.porcentaje}
                    onChange={(e) => cambiar(f.clave, { porcentaje: e.target.value })}
                    placeholder="50,00"
                    autoComplete="off"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Quitar titular"
                aria-label={`Quitar titular ${n}`}
                onClick={() => {
                  setGuardado(false)
                  setFilas((previas) => previas.filter((o) => o.clave !== f.clave))
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setFilas((previas) => [...previas, filaVacia()])}>
          <Plus className="size-4" />
          Agregar titular
        </Button>
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <span className="text-muted-foreground">Total</span>
          <BadgeEstado tono={total === CIEN_POR_CIENTO ? 'ok' : 'atencion'}>{porcentaje(deCentesimas(total))}</BadgeEstado>
        </p>
      </div>

      {problema && <p className="text-sm text-muted-foreground">{problema}</p>}
      <AvisoDeError mensaje={error ?? errorDeClientes} />
      {guardado && !problema && <p role="status" className="text-sm text-muted-foreground">Titulares guardados.</p>}

      <div className="flex justify-end">
        <Button type="button" disabled={problema !== null || guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar titulares'}
        </Button>
      </div>
    </div>
  )
}
