/**
 * Los cobros de cuotas: el listado con sus filtros (contrato, fechas y «incluir anulados»). Cada cobro tiene su recibo del motor.
 *
 * Los anulados no aparecen salvo que se pidan (`?incluir_anulados=true`); cuando se piden, se ven atenuados y marcados.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable, sortableHeader } from 'libra-ui/data-table'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'
import { ICONOS } from 'libra-ui/iconos-identidad'
import { SelectBuscable } from 'libra-ui/SelectBuscable'
import { BadgeEstado } from 'libra-ui/badge-estado'

import { Anulado } from '@/components/Estados'
import { AvisoDeError } from '@/components/listado'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LIMITE_DE_PAGINA_GRANDE, cobros, contratos, mensajeDeError } from '@/lib/api'
import type { Cobro, Contrato } from '@/lib/api'
import { fecha, nombreDelMes } from '@/lib/fechas'
import { aCentesimas, pesos } from '@/lib/importes'

/** «Todos»: el centinela del filtro de contrato (un `Select` no admite el valor vacío). */
const TODOS = '__todos__'

export function Cobros() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Cobro[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [losContratos, setLosContratos] = useState<Contrato[]>([])

  const [contrato, setContrato] = useState(TODOS)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [anulados, setAnulados] = useState(false)

  useEffect(() => {
    contratos.listar().then(setLosContratos).catch((e: unknown) => setError(mensajeDeError(e)))
  }, [])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    cobros
      .listar({
        contrato_id: contrato === TODOS ? undefined : Number(contrato),
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
  }, [contrato, desde, hasta, anulados])

  const opcionesDeContratos = useMemo(
    () => [
      { value: TODOS, label: 'Todos los contratos' },
      ...losContratos.map((c) => ({ value: String(c.id), label: c.numero, hint: `${c.propiedad_direccion} · ${c.inquilino_nombre}` })),
    ],
    [losContratos],
  )

  const columnas = useMemo<ColumnDef<Cobro, unknown>[]>(
    () => [
      {
        id: 'fecha',
        accessorFn: (c) => c.fecha,
        header: sortableHeader('Fecha'),
        size: 120,
        cell: ({ row }) => (
          <Link to={`/cobros/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
            {fecha(row.original.fecha)}
          </Link>
        ),
      },
      {
        accessorKey: 'numero_contrato',
        header: sortableHeader('Contrato'),
        size: 125,
        cell: ({ row }) => (
          <Link to={`/contratos/${row.original.contrato_id}`} className="underline-offset-4 hover:underline">
            {row.original.numero_contrato}
          </Link>
        ),
      },
      { accessorKey: 'inquilino_nombre', header: sortableHeader('Inquilino'), size: 180, minSize: 130, meta: { stretch: true } },
      {
        id: 'cuota',
        accessorFn: (c) => c.periodo_desde,
        header: sortableHeader('Cuota'),
        size: 140,
        cell: ({ row }) => nombreDelMes(row.original.periodo_desde),
      },
      {
        id: 'total',
        // La clave de orden es el texto con ceros a la izquierda: se ordena sin pasar el importe por `number`.
        accessorFn: (c) => c.total.padStart(20, '0'),
        header: sortableHeader('Total'),
        size: 210,
        cell: ({ row }) => (
          <div>
            {pesos(row.original.total, row.original.moneda)}
            {aCentesimas(row.original.punitorio) !== 0 && (
              <div className="text-xs text-muted-foreground">incluye {pesos(row.original.punitorio, row.original.moneda)} de punitorio</div>
            )}
          </div>
        ),
      },
      {
        id: 'recibo',
        header: 'Recibo',
        size: 130,
        cell: ({ row }) => (row.original.recibo ? `N° ${row.original.recibo.numero}` : '—'),
      },
      {
        id: 'estado',
        header: 'Estado',
        size: 110,
        cell: ({ row }) => (row.original.anulado ? <Anulado /> : <BadgeEstado tono="ok">Cobrado</BadgeEstado>),
      },
    ],
    [],
  )

  const hayFiltros = contrato !== TODOS || desde !== '' || hasta !== '' || anulados
  const mensajeVacio = cargando
    ? 'Cargando…'
    : error
      ? 'No se pudo cargar la lista.'
      : hayFiltros
        ? 'Ningún cobro coincide con los filtros.'
        : 'Todavía no hay cobros registrados.'

  return (
    <div className="space-y-3">
      <TituloPantalla icono={ICONOS.recibos}>Cobros</TituloPantalla>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="contrato-cobro" className="text-xs text-muted-foreground">Contrato</Label>
          <SelectBuscable
            id="contrato-cobro"
            value={contrato}
            onChange={setContrato}
            opciones={opcionesDeContratos}
            placeholder="Buscar contrato…"
            ariaLabel="Filtrar por contrato"
            className="w-64"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cobro-desde" className="text-xs text-muted-foreground">Cobrados desde</Label>
          <Input id="cobro-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cobro-hasta" className="text-xs text-muted-foreground">Cobrados hasta</Label>
          <Input id="cobro-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-44" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={anulados} onChange={(e) => setAnulados(e.target.checked)} />
          Incluir los anulados
        </label>
      </div>

      <AvisoDeError mensaje={error} />

      <p className="text-sm text-muted-foreground">
        {cargando ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'cobro' : 'cobros'}`}
        {!cargando && filas.length >= LIMITE_DE_PAGINA_GRANDE && ` (se muestran los primeros ${LIMITE_DE_PAGINA_GRANDE}: afiná los filtros para ver el resto)`}
      </p>

      <DataTable
        columns={columnas}
        data={filas}
        emptyMessage={mensajeVacio}
        getRowClassName={(c) => (c.anulado ? 'opacity-50' : undefined)}
        onRowClick={(c) => navigate(`/cobros/${c.id}`)}
      />
    </div>
  )
}

