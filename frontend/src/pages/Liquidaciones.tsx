/**
 * Las liquidaciones a propietarios: el listado con sus filtros (propietario y estado). Emitir una es otra pantalla
 * (`/liquidaciones/nueva`): se previsualiza antes de escribir nada. Una con neto negativo figura «Con saldo deudor» (ADR-011) y, cuando la
 * siguiente la descuenta, «Saldada».
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Plus } from 'lucide-react'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable, sortableHeader } from 'libra-ui/data-table'
import { SelectBuscable } from 'libra-ui/SelectBuscable'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { EstadoDeLiquidacion } from '@/components/Estados'
import { AvisoDeError } from '@/components/listado'
import { SelectCerrado } from '@/components/SelectCerrado'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useClientes } from '@/hooks/use-clientes'
import { LIMITE_DE_PAGINA_GRANDE, liquidaciones, mensajeDeError } from '@/lib/api'
import type { Liquidacion } from '@/lib/api'
import { ESTADOS_DE_LIQUIDACION } from '@/lib/dominio'
import { fecha } from '@/lib/fechas'
import { aCentesimas, esNegativo, pesos } from '@/lib/importes'

/** «Todos»: el centinela de un filtro (un `Select` no admite el valor vacío). */
const TODOS = '__todos__'

const OPCIONES_DE_ESTADO = [{ value: TODOS, label: 'Todos los estados' }, ...ESTADOS_DE_LIQUIDACION]

export function Liquidaciones() {
  const navigate = useNavigate()
  const { opciones: clientes, error: errorDeClientes } = useClientes()
  const [filas, setFilas] = useState<Liquidacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [propietario, setPropietario] = useState(TODOS)
  const [estado, setEstado] = useState(TODOS)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    liquidaciones
      .listar({
        propietario_id: propietario === TODOS ? undefined : Number(propietario),
        estado: estado === TODOS ? undefined : estado,
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
  }, [propietario, estado])

  const opcionesDePropietarios = useMemo(() => [{ value: TODOS, label: 'Todos los propietarios' }, ...clientes], [clientes])

  const columnas = useMemo<ColumnDef<Liquidacion, unknown>[]>(
    () => [
      {
        accessorKey: 'numero',
        header: sortableHeader('Número'),
        size: 140,
        cell: ({ row }) => (
          <Link to={`/liquidaciones/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
            {row.original.numero}
          </Link>
        ),
      },
      { accessorKey: 'propietario_nombre', header: sortableHeader('Propietario'), size: 220, minSize: 140, meta: { stretch: true } },
      {
        id: 'fecha',
        accessorFn: (l) => l.fecha,
        header: sortableHeader('Fecha'),
        size: 130,
        cell: ({ row }) => fecha(row.original.fecha),
      },
      {
        id: 'hasta',
        accessorFn: (l) => l.hasta,
        header: sortableHeader('Hasta'),
        size: 130,
        cell: ({ row }) => fecha(row.original.hasta),
      },
      { id: 'cobrado', header: 'Cobrado', size: 150, cell: ({ row }) => pesos(row.original.cobrado, row.original.moneda) },
      { id: 'comision', header: 'Comisión', size: 140, cell: ({ row }) => pesos(row.original.comision, row.original.moneda) },
      {
        id: 'neto',
        // La clave de orden son los centavos enteros con su signo (una liquidación con saldo deudor tiene el neto negativo): sin `float`.
        accessorFn: (l) => (esNegativo(l.neto) ? -1 : 1) * (aCentesimas(l.neto.replace(/^-/, '')) ?? 0),
        header: sortableHeader('Neto'),
        size: 150,
        cell: ({ row }) => <span className="font-medium">{pesos(row.original.neto, row.original.moneda)}</span>,
      },
      {
        accessorKey: 'estado',
        header: sortableHeader('Estado'),
        size: 130,
        cell: ({ row }) => <EstadoDeLiquidacion estado={row.original.estado} />,
      },
    ],
    [],
  )

  const hayFiltros = propietario !== TODOS || estado !== TODOS
  const mensajeVacio = cargando
    ? 'Cargando…'
    : error
      ? 'No se pudo cargar la lista.'
      : hayFiltros
        ? 'Ninguna liquidación coincide con los filtros.'
        : 'Todavía no hay liquidaciones emitidas.'

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FileSpreadsheet}
        acciones={
          <Button onClick={() => navigate('/liquidaciones/nueva')}>
            <Plus className="size-4" />
            Nueva liquidación
          </Button>
        }
      >
        Liquidaciones
      </TituloPantalla>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="propietario-liquidacion" className="text-xs text-muted-foreground">Propietario</Label>
          {/* cliente-sin-alta: filtro del listado de liquidaciones, no crea nada */}
          <SelectBuscable
            id="propietario-liquidacion"
            value={propietario}
            onChange={setPropietario}
            opciones={opcionesDePropietarios}
            placeholder="Buscar propietario…"
            ariaLabel="Filtrar por propietario"
            className="w-72"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="estado-liquidacion" className="text-xs text-muted-foreground">Estado</Label>
          <SelectCerrado
            id="estado-liquidacion"
            value={estado}
            onChange={setEstado}
            opciones={OPCIONES_DE_ESTADO}
            ariaLabel="Filtrar por estado"
            className="w-48"
          />
        </div>
      </div>

      <AvisoDeError mensaje={error ?? errorDeClientes} />

      <p className="text-sm text-muted-foreground">
        {cargando ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'liquidación' : 'liquidaciones'}`}
        {!cargando && filas.length >= LIMITE_DE_PAGINA_GRANDE && ` (se muestran las primeras ${LIMITE_DE_PAGINA_GRANDE}: afiná los filtros para ver el resto)`}
      </p>

      <DataTable
        columns={columnas}
        data={filas}
        emptyMessage={mensajeVacio}
        getRowClassName={(l) => (l.estado === 'anulada' ? 'opacity-50' : undefined)}
        onRowClick={(l) => navigate(`/liquidaciones/${l.id}`)}
      />
    </div>
  )
}
