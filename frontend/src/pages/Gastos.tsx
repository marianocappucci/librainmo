/**
 * Los gastos por cuenta del propietario: el listado con sus filtros, el alta y la anulación (ADR-007).
 *
 * Un gasto es un cargo en la cuenta de cada titular de la propiedad (repartido por su porcentaje) y se descuenta en la próxima
 * liquidación. Anularlo contraasienta; si ya entró en una liquidación, el servidor lo rechaza (409) y el motivo se ve arriba.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, XCircle } from 'lucide-react'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable, sortableHeader } from 'libra-ui/data-table'
import { SelectBuscable } from 'libra-ui/SelectBuscable'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'
import { ICONOS } from 'libra-ui/iconos-identidad'

import { DialogoDeMotivo } from '@/components/DialogoDeMotivo'
import { Anulado } from '@/components/Estados'
import { FormularioDeGasto } from '@/components/FormularioDeGasto'
import { AvisoDeError, BotonDeFila, columnaDeAcciones } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LIMITE_DE_PAGINA_GRANDE, gastos, mensajeDeError, propiedades } from '@/lib/api'
import type { Gasto, Propiedad } from '@/lib/api'
import { CATEGORIAS_DE_GASTO, direccionCompleta, etiquetaDe } from '@/lib/dominio'
import { fecha } from '@/lib/fechas'
import { pesos } from '@/lib/importes'

/** «Todas»: el centinela del filtro de propiedad (un `Select` no admite el valor vacío). */
const TODAS = '__todas__'

export function Gastos() {
  const [filas, setFilas] = useState<Gasto[]>([])
  const [lasPropiedades, setLasPropiedades] = useState<Propiedad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const [propiedad, setPropiedad] = useState(TODAS)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [anulados, setAnulados] = useState(false)

  const [alta, setAlta] = useState(false)
  const [aAnular, setAAnular] = useState<Gasto | null>(null)

  useEffect(() => {
    propiedades.listar().then(setLasPropiedades).catch((e: unknown) => setError(mensajeDeError(e)))
  }, [])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    gastos
      .listar({
        propiedad_id: propiedad === TODAS ? undefined : Number(propiedad),
        desde: desde || undefined,
        hasta: hasta || undefined,
        incluir_anulados: anulados || undefined,
      })
      .then((lista) => {
        if (!vigente) return
        setFilas(lista)
        setError(null)
      })
      .catch((e: unknown) => vigente && setError(mensajeDeError(e)))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [propiedad, desde, hasta, anulados, version])

  const opcionesDePropiedades = useMemo(
    () => [
      { value: TODAS, label: 'Todas las propiedades' },
      ...lasPropiedades.map((p) => ({ value: String(p.id), label: `${p.codigo} · ${direccionCompleta(p)}` })),
    ],
    [lasPropiedades],
  )

  const columnas = useMemo<ColumnDef<Gasto, unknown>[]>(
    () => [
      {
        id: 'fecha',
        accessorFn: (g) => g.fecha,
        header: sortableHeader('Fecha'),
        size: 120,
        cell: ({ row }) => fecha(row.original.fecha),
      },
      {
        id: 'propiedad',
        accessorFn: (g) => `${g.propiedad_codigo} ${g.propiedad_direccion}`,
        header: sortableHeader('Propiedad'),
        size: 220,
        minSize: 150,
        meta: { stretch: true },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.propiedad_direccion}</div>
            <div className="text-xs text-muted-foreground">{row.original.propiedad_codigo}</div>
          </div>
        ),
      },
      {
        accessorKey: 'categoria',
        header: sortableHeader('Categoría'),
        size: 170,
        cell: ({ row }) => etiquetaDe(CATEGORIAS_DE_GASTO, row.original.categoria),
      },
      {
        id: 'descripcion',
        accessorFn: (g) => g.descripcion,
        header: 'Descripción',
        size: 240,
        cell: ({ row }) => (
          <div>
            <div>
              {row.original.descripcion} {row.original.anulado && <Anulado />}
            </div>
            {row.original.comprobante && <div className="text-xs text-muted-foreground">Comprobante {row.original.comprobante}</div>}
          </div>
        ),
      },
      {
        id: 'importe',
        // La clave de orden es el texto con ceros a la izquierda: se ordena sin pasar el importe por `number`.
        accessorFn: (g) => g.importe.padStart(20, '0'),
        header: sortableHeader('Importe'),
        size: 140,
        cell: ({ row }) => pesos(row.original.importe),
      },
      columnaDeAcciones<Gasto>({
        botones: 1,
        celda: (g) =>
          g.anulado ? null : (
            <BotonDeFila titulo="Anular gasto" fila={`${g.descripcion}`} onClick={() => setAAnular(g)}>
              <XCircle className="size-4" />
            </BotonDeFila>
          ),
      }),
    ],
    [],
  )

  const hayFiltros = propiedad !== TODAS || desde !== '' || hasta !== '' || anulados
  const mensajeVacio = cargando
    ? 'Cargando…'
    : error
      ? 'No se pudo cargar la lista.'
      : hayFiltros
        ? 'Ningún gasto coincide con los filtros.'
        : 'Todavía no hay gastos cargados.'

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={ICONOS.egresos}
        acciones={
          <Button onClick={() => setAlta(true)}>
            <Plus className="size-4" />
            Nuevo gasto
          </Button>
        }
      >
        Gastos
      </TituloPantalla>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="propiedad-gasto" className="text-xs text-muted-foreground">Propiedad</Label>
          <SelectBuscable
            id="propiedad-gasto"
            value={propiedad}
            onChange={setPropiedad}
            opciones={opcionesDePropiedades}
            placeholder="Buscar propiedad…"
            ariaLabel="Filtrar por propiedad"
            className="w-72"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gasto-desde" className="text-xs text-muted-foreground">Desde</Label>
          <Input id="gasto-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gasto-hasta" className="text-xs text-muted-foreground">Hasta</Label>
          <Input id="gasto-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-44" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={anulados} onChange={(e) => setAnulados(e.target.checked)} />
          Incluir los anulados
        </label>
      </div>

      <AvisoDeError mensaje={error} />

      <p className="text-sm text-muted-foreground">
        {cargando ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'gasto' : 'gastos'}`}
        {!cargando && filas.length >= LIMITE_DE_PAGINA_GRANDE && ` (se muestran los primeros ${LIMITE_DE_PAGINA_GRANDE}: afiná los filtros para ver el resto)`}
      </p>

      {/* El reparto entre titulares va en la fila desplegable: una columna más no entra en el ancho de una pantalla de 1366. */}
      <DataTable
        columns={columnas}
        data={filas}
        emptyMessage={mensajeVacio}
        getRowClassName={(g) => (g.anulado ? 'opacity-50' : undefined)}
        detalle={{
          etiqueta: (g) => `Ver el reparto de ${g.descripcion}`,
          render: (g) => (
            <div className="space-y-0.5 py-1 text-sm">
              <div className="text-xs text-muted-foreground">Reparto entre los titulares de la propiedad</div>
              {g.imputaciones.map((i) => (
                <div key={i.propietario_id}>
                  {i.propietario_nombre}: {pesos(i.importe)}
                </div>
              ))}
            </div>
          ),
        }}
      />

      <FormularioDeGasto
        abierto={alta}
        propiedades={lasPropiedades}
        onCerrar={() => setAlta(false)}
        onGuardado={() => {
          setAlta(false)
          setVersion((v) => v + 1)
        }}
      />
      <DialogoDeMotivo
        abierto={aAnular !== null}
        titulo={aAnular ? `Anular el gasto «${aAnular.descripcion}»` : 'Anular el gasto'}
        descripcion="Se contraasienta el cargo de cada titular. Si el gasto ya está en una liquidación, primero hay que anular la liquidación."
        confirmar="Anular gasto"
        onCerrar={() => setAAnular(null)}
        onConfirmar={async (motivo) => {
          if (!aAnular) return
          await gastos.anular(aAnular.id, motivo)
          setAAnular(null)
          setVersion((v) => v + 1)
        }}
      />
    </div>
  )
}
