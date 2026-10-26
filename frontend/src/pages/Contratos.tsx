/**
 * Los contratos de locación: listado con búsqueda y filtro por estado. El alta es una página propia (`/contratos/nuevo`).
 *
 * La búsqueda y el filtro los resuelve el servidor (`?q=&estado=`): busca en el número de contrato y en el código y la dirección de la
 * propiedad. El importe es el del precio vigente y sale tal cual lo manda la API, con el formato argentino (`lib/importes.ts`).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FilePenLine, Plus } from 'lucide-react'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable, sortableHeader } from 'libra-ui/data-table'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { EstadoDeContrato } from '@/components/Estados'
import { AvisoDeError } from '@/components/listado'
import { SelectCerrado } from '@/components/SelectCerrado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebounced } from '@/hooks/use-debounced'
import { LIMITE_DE_PAGINA, contratos, mensajeDeError } from '@/lib/api'
import type { Contrato } from '@/lib/api'
import { ESTADOS_DE_CONTRATO } from '@/lib/dominio'
import { fecha } from '@/lib/fechas'
import { pesos } from '@/lib/importes'

/** «Todos los estados»: el centinela del filtro (un `Select` no admite el valor vacío). */
const TODOS = '__todos__'

const OPCIONES_DE_ESTADO = [{ value: TODOS, label: 'Todos los estados' }, ...ESTADOS_DE_CONTRATO]

export function Contratos() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Contrato[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState(TODOS)
  const q = useDebounced(busqueda.trim())

  useEffect(() => {
    let vigente = true
    setCargando(true)
    contratos
      .listar({ q: q || undefined, estado: estado === TODOS ? undefined : estado })
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
  }, [q, estado])

  const columnas = useMemo<ColumnDef<Contrato, unknown>[]>(
    () => [
      {
        accessorKey: 'numero',
        header: sortableHeader('Número'),
        size: 140,
        cell: ({ row }) => (
          <Link to={`/contratos/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
            {row.original.numero}
          </Link>
        ),
      },
      {
        id: 'propiedad',
        accessorFn: (c) => `${c.propiedad_codigo} ${c.propiedad_direccion}`,
        header: sortableHeader('Propiedad'),
        size: 260,
        minSize: 160,
        meta: { stretch: true },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.propiedad_direccion}</div>
            <div className="text-xs text-muted-foreground">{row.original.propiedad_codigo}</div>
          </div>
        ),
      },
      { accessorKey: 'inquilino_nombre', header: sortableHeader('Inquilino'), size: 200, minSize: 140 },
      {
        id: 'plazo',
        accessorFn: (c) => c.fecha_inicio,
        header: sortableHeader('Plazo'),
        size: 230,
        cell: ({ row }) => `${fecha(row.original.fecha_inicio)} al ${fecha(row.original.fecha_fin)}`,
      },
      {
        id: 'importe',
        // La clave de orden es el texto con ceros a la izquierda: se ordena sin pasar el importe por `number`.
        accessorFn: (c) => (c.importe_vigente ?? '').padStart(20, '0'),
        header: sortableHeader('Alquiler'),
        size: 150,
        cell: ({ row }) => pesos(row.original.importe_vigente, row.original.moneda) || '—',
      },
      {
        accessorKey: 'estado',
        header: sortableHeader('Estado'),
        size: 130,
        cell: ({ row }) => <EstadoDeContrato estado={row.original.estado} />,
      },
    ],
    [],
  )

  const hayFiltros = busqueda !== '' || estado !== TODOS
  const mensajeVacio = cargando
    ? 'Cargando…'
    : error
      ? 'No se pudo cargar la lista.'
      : hayFiltros
        ? 'Ningún contrato coincide con la búsqueda.'
        : 'Todavía no hay contratos cargados.'

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FilePenLine}
        acciones={
          <Button onClick={() => navigate('/contratos/nuevo')}>
            <Plus className="size-4" />
            Nuevo contrato
          </Button>
        }
      >
        Contratos
      </TituloPantalla>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="buscar-contrato" className="text-xs text-muted-foreground">Buscar</Label>
          <Input
            id="buscar-contrato"
            type="search"
            placeholder="Número, código o dirección"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-72"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="estado-contrato" className="text-xs text-muted-foreground">Estado</Label>
          <SelectCerrado
            id="estado-contrato"
            value={estado}
            onChange={setEstado}
            opciones={OPCIONES_DE_ESTADO}
            ariaLabel="Filtrar por estado"
            className="w-48"
          />
        </div>
      </div>

      <AvisoDeError mensaje={error} />

      <p className="text-sm text-muted-foreground">
        {cargando ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'contrato' : 'contratos'}`}
        {!cargando && filas.length >= LIMITE_DE_PAGINA && ` (se muestran los primeros ${LIMITE_DE_PAGINA}: afiná la búsqueda para ver el resto)`}
      </p>

      <DataTable
        columns={columnas}
        data={filas}
        emptyMessage={mensajeVacio}
        onRowClick={(c) => navigate(`/contratos/${c.id}`)}
      />
    </div>
  )
}
