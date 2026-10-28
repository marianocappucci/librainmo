/**
 * Las cuotas: el listado con sus filtros (estado, contrato y rango de meses). Generarlas es otra pantalla (`/cuotas/generar`), porque
 * previsualizar y confirmar no es un diálogo.
 *
 * Los filtros los resuelve el servidor (`?estado=&contrato_id=&desde=&hasta=`). El rango se arma con el primer día del mes «desde» y el
 * último del mes «hasta» (`lib/fechas.ts`, sin `Date`): la cuota se filtra por el comienzo de su período.
 *
 * Una pendiente con pagos a cuenta (ADR-010) sigue pendiente, y el estado dice cuánto le falta: «Pendiente · saldo $ X».
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, Plus } from 'lucide-react'
import type { ColumnDef } from 'libra-ui/data-table'
import { DataTable, sortableHeader } from 'libra-ui/data-table'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'
import { SelectBuscable } from 'libra-ui/SelectBuscable'

import { EstadoDeCuotaConSaldo } from '@/components/Estados'
import { AvisoDeError } from '@/components/listado'
import { SelectCerrado } from '@/components/SelectCerrado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { contratos, cuotas, LIMITE_DE_PAGINA_GRANDE, mensajeDeError } from '@/lib/api'
import type { Contrato, Cuota } from '@/lib/api'
import { ESTADOS_DE_CUOTA } from '@/lib/dominio'
import { fecha, nombreDelMes, primerDiaDelMes, ultimoDiaDelMes } from '@/lib/fechas'
import { pesos } from '@/lib/importes'

/** «Todos»: el centinela de un filtro (un `Select` no admite el valor vacío). */
const TODOS = '__todos__'

const OPCIONES_DE_ESTADO = [{ value: TODOS, label: 'Todos los estados' }, ...ESTADOS_DE_CUOTA]

export function Cuotas() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Cuota[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [losContratos, setLosContratos] = useState<Contrato[]>([])

  const [estado, setEstado] = useState(TODOS)
  const [contrato, setContrato] = useState(TODOS)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    contratos.listar().then(setLosContratos).catch((e: unknown) => setError(mensajeDeError(e)))
  }, [])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    cuotas
      .listar({
        estado: estado === TODOS ? undefined : estado,
        contrato_id: contrato === TODOS ? undefined : Number(contrato),
        desde: desde ? primerDiaDelMes(desde) : undefined,
        hasta: hasta ? ultimoDiaDelMes(hasta) : undefined,
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
  }, [estado, contrato, desde, hasta])

  const opcionesDeContratos = useMemo(
    () => [
      { value: TODOS, label: 'Todos los contratos' },
      ...losContratos.map((c) => ({ value: String(c.id), label: c.numero, hint: `${c.propiedad_direccion} · ${c.inquilino_nombre}` })),
    ],
    [losContratos],
  )

  const columnas = useMemo<ColumnDef<Cuota, unknown>[]>(
    () => [
      {
        id: 'periodo',
        accessorFn: (c) => c.periodo_desde,
        header: sortableHeader('Mes'),
        size: 160,
        cell: ({ row }) => (
          <Link to={`/cuotas/${row.original.id}`} className="font-medium underline-offset-4 hover:underline">
            {nombreDelMes(row.original.periodo_desde)}
          </Link>
        ),
      },
      {
        accessorKey: 'numero_contrato',
        header: sortableHeader('Contrato'),
        size: 130,
        cell: ({ row }) => (
          <Link to={`/contratos/${row.original.contrato_id}`} className="underline-offset-4 hover:underline">
            {row.original.numero_contrato}
          </Link>
        ),
      },
      { accessorKey: 'inquilino_nombre', header: sortableHeader('Inquilino'), size: 220, minSize: 140, meta: { stretch: true } },
      {
        id: 'vencimiento',
        accessorFn: (c) => c.fecha_vencimiento,
        header: sortableHeader('Vence'),
        size: 130,
        cell: ({ row }) => fecha(row.original.fecha_vencimiento),
      },
      {
        id: 'total',
        // La clave de orden es el texto con ceros a la izquierda: se ordena sin pasar el importe por `number`.
        accessorFn: (c) => c.total.padStart(20, '0'),
        header: sortableHeader('Total'),
        size: 150,
        cell: ({ row }) => pesos(row.original.total, row.original.moneda),
      },
      {
        accessorKey: 'estado',
        header: sortableHeader('Estado'),
        size: 220,
        cell: ({ row }) => <EstadoDeCuotaConSaldo cuota={row.original} />,
      },
    ],
    [],
  )

  const hayFiltros = estado !== TODOS || contrato !== TODOS || desde !== '' || hasta !== ''
  const mensajeVacio = cargando
    ? 'Cargando…'
    : error
      ? 'No se pudo cargar la lista.'
      : hayFiltros
        ? 'Ninguna cuota coincide con los filtros.'
        : 'Todavía no hay cuotas generadas.'

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={CalendarClock}
        acciones={
          <Button onClick={() => navigate('/cuotas/generar')}>
            <Plus className="size-4" />
            Generar las cuotas del mes
          </Button>
        }
      >
        Cuotas
      </TituloPantalla>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="estado-cuota" className="text-xs text-muted-foreground">Estado</Label>
          <SelectCerrado
            id="estado-cuota"
            value={estado}
            onChange={setEstado}
            opciones={OPCIONES_DE_ESTADO}
            ariaLabel="Filtrar por estado"
            className="w-48"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contrato-cuota" className="text-xs text-muted-foreground">Contrato</Label>
          <SelectBuscable
            id="contrato-cuota"
            value={contrato}
            onChange={setContrato}
            opciones={opcionesDeContratos}
            placeholder="Buscar contrato…"
            ariaLabel="Filtrar por contrato"
            className="w-64"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cuota-desde" className="text-xs text-muted-foreground">Desde el mes</Label>
          <Input id="cuota-desde" type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cuota-hasta" className="text-xs text-muted-foreground">Hasta el mes</Label>
          <Input id="cuota-hasta" type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </div>
      </div>

      <AvisoDeError mensaje={error} />

      <p className="text-sm text-muted-foreground">
        {cargando ? 'Cargando…' : `${filas.length} ${filas.length === 1 ? 'cuota' : 'cuotas'}`}
        {!cargando && filas.length >= LIMITE_DE_PAGINA_GRANDE && ` (se muestran las primeras ${LIMITE_DE_PAGINA_GRANDE}: afiná los filtros para ver el resto)`}
      </p>

      <DataTable columns={columnas} data={filas} emptyMessage={mensajeVacio} onRowClick={(c) => navigate(`/cuotas/${c.id}`)} />
    </div>
  )
}
