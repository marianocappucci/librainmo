/**
 * Las propiedades que administra la inmobiliaria: listado con búsqueda y filtro por estado, y el alta.
 *
 * La búsqueda y el filtro los resuelve el servidor (`?q=&estado=`), que busca en la dirección, el código, la localidad y la unidad. La
 * API no devuelve un total, así que se pide el tope de página y, si se llegó, se avisa que hay más.
 *
 * El alta es un diálogo; al guardar lleva a la ficha, donde se cargan los titulares (no se cargan acá: se reemplazan juntos y suman 100).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable, sortableHeader } from 'libra-ui/data-table'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { EstadoDePropiedad } from '@/components/Estados'
import { FormularioDePropiedad } from '@/components/FormularioDePropiedad'
import { AvisoDeError } from '@/components/listado'
import { SelectCerrado } from '@/components/SelectCerrado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebounced } from '@/hooks/use-debounced'
import { LIMITE_DE_PAGINA, mensajeDeError, propiedades } from '@/lib/api'
import type { Propiedad } from '@/lib/api'
import { ESTADOS_DE_PROPIEDAD, TIPOS_DE_PROPIEDAD, direccionCompleta, etiquetaDe } from '@/lib/dominio'

/** «Todos los estados»: el centinela del filtro (un `Select` no admite el valor vacío). */
const TODOS = '__todos__'

const OPCIONES_DE_ESTADO = [{ value: TODOS, label: 'Todos los estados' }, ...ESTADOS_DE_PROPIEDAD]

export function Propiedades() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Propiedad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState(TODOS)
  const q = useDebounced(busqueda.trim())
  const [alta, setAlta] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    propiedades
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

  const columnas = useMemo<ColumnDef<Propiedad, unknown>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: sortableHeader('Código'),
        size: 130,
        cell: ({ row }) => (
          <Link to={`/propiedades/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
            {row.original.codigo}
          </Link>
        ),
      },
      {
        id: 'direccion',
        accessorFn: (p) => direccionCompleta(p),
        header: sortableHeader('Dirección'),
        size: 260,
        minSize: 160,
        meta: { stretch: true },
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{direccionCompleta(row.original)}</div>
            {row.original.localidad && <div className="text-xs text-muted-foreground">{row.original.localidad}</div>}
          </div>
        ),
      },
      {
        accessorKey: 'tipo',
        header: sortableHeader('Tipo'),
        size: 130,
        cell: ({ row }) => etiquetaDe(TIPOS_DE_PROPIEDAD, row.original.tipo),
      },
      {
        id: 'titulares',
        header: 'Titulares',
        size: 220,
        cell: ({ row }) => {
          const { titulares, titulares_completos: completos } = row.original
          if (titulares.length === 0) return <span className="text-muted-foreground">Sin titulares</span>
          return (
            <span>
              {titulares.map((t) => t.nombre).join(', ')}
              {!completos && <span className="text-muted-foreground"> (incompletos)</span>}
            </span>
          )
        },
      },
      {
        id: 'contrato',
        header: 'Contrato vigente',
        size: 150,
        cell: ({ row }) => {
          const c = row.original.contrato_vigente
          return c ? (
            <Link to={`/contratos/${c.id}`} className="underline-offset-4 hover:underline">
              {c.numero}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        accessorKey: 'estado',
        header: sortableHeader('Estado'),
        size: 130,
        cell: ({ row }) => <EstadoDePropiedad estado={row.original.estado} />,
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
        ? 'Ninguna propiedad coincide con la búsqueda.'
        : 'Todavía no hay propiedades cargadas.'

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={Building2}
        acciones={
          <Button onClick={() => setAlta(true)}>
            <Plus className="size-4" />
            Nueva propiedad
          </Button>
        }
      >
        Propiedades
      </TituloPantalla>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="buscar-propiedad" className="text-xs text-muted-foreground">Buscar</Label>
          <Input
            id="buscar-propiedad"
            type="search"
            placeholder="Dirección, código o localidad"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-72"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="estado-propiedad" className="text-xs text-muted-foreground">Estado</Label>
          <SelectCerrado
            id="estado-propiedad"
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
        {cargando ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'propiedad' : 'propiedades'}`}
        {!cargando && filas.length >= LIMITE_DE_PAGINA && ` (se muestran las primeras ${LIMITE_DE_PAGINA}: afiná la búsqueda para ver el resto)`}
      </p>

      <DataTable
        columns={columnas}
        data={filas}
        emptyMessage={mensajeVacio}
        onRowClick={(p) => navigate(`/propiedades/${p.id}`)}
      />

      <FormularioDePropiedad
        abierto={alta}
        propiedad={null}
        onCerrar={() => setAlta(false)}
        onGuardado={(p) => {
          setAlta(false)
          navigate(`/propiedades/${p.id}`)
        }}
      />
    </div>
  )
}
