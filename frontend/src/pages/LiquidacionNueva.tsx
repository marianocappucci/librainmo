/**
 * Emitir la liquidación a un propietario: elegirlo, elegir la fecha y hasta dónde se liquida, previsualizar los movimientos y los
 * totales, y emitir con confirmación (ADR-007).
 *
 * 🔑 **Entra todo lo que no estaba en otra liquidación, hasta la fecha «hasta»**: los cobros a su favor y los gastos que se le cargaron.
 * Un movimiento se liquida una sola vez. La previsualización no escribe nada; si cambia el propietario o alguna fecha, se descarta (era
 * de otra consulta) y hay que volver a previsualizar.
 *
 * 🔴 No se emite con neto negativo (los gastos y la comisión superan lo cobrado): la deuda del propietario con la inmobiliaria y cómo se
 * arrastra a la liquidación siguiente es una regla del piloto que falta (ADR-007, punto 5). La pantalla lo dice y no ofrece emitir.
 *
 * 🔑 **Una liquidación es de una moneda** (ADR-088 del motor): se elige (pesos por omisión) y entran sólo los movimientos en ella. Un
 * propietario con contratos en pesos y en dólares recibe dos liquidaciones: si la previsualización dice que tiene pendientes en la otra
 * moneda (`monedas_con_pendientes`), la pantalla lo avisa y ofrece pasar a ella.
 *
 * El propietario es `SelectCliente` con alta en el lugar (ADR-071); desde el reporte de fondos de terceros llega con `?propietario=` y `?moneda=`.
 */
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, FileSpreadsheet } from 'lucide-react'
import { SelectCliente } from 'libra-ui/SelectCliente'
import { CAMPOS_CLIENTE_DEL_MOTOR } from 'libra-ui/comercio/alta-de-cliente'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SelectCerrado } from '@/components/SelectCerrado'
import { ItemsDeLiquidacion, TotalesDeLiquidacionVista } from '@/components/ItemsDeLiquidacion'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useClientes } from '@/hooks/use-clientes'
import { liquidaciones, mensajeDeError } from '@/lib/api'
import type { PrevisualizacionDeLiquidacion } from '@/lib/api'
import { MONEDAS, nombreDeMoneda } from '@/lib/dominio'
import { fecha as verFecha, hoyISO } from '@/lib/fechas'
import { esNegativo, pesos } from '@/lib/importes'

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function LiquidacionNueva() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { opciones, crear, error: errorDeClientes } = useClientes()
  const [propietario, setPropietario] = useState(params.get('propietario') ?? '')
  const [fecha, setFecha] = useState(hoyISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [moneda, setMoneda] = useState(MONEDAS.some((m) => m.value === params.get('moneda')) ? (params.get('moneda') as string) : 'ARS')
  const [observaciones, setObservaciones] = useState('')
  const [vista, setVista] = useState<PrevisualizacionDeLiquidacion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [emitiendo, setEmitiendo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lo previsualizado era de otra consulta: con otro propietario o con otra fecha, no se puede emitir.
  const descartar = () => {
    setVista(null)
    setError(null)
  }

  const hastaPosterior = ISO.test(fecha) && ISO.test(hasta) && hasta > fecha
  const datosValidos = propietario !== '' && ISO.test(fecha) && ISO.test(hasta) && !hastaPosterior

  async function previsualizar(enMoneda = moneda) {
    if (!datosValidos) return
    setCargando(true)
    setError(null)
    try {
      setVista(await liquidaciones.previsualizar(Number(propietario), hasta, enMoneda))
    } catch (e) {
      setVista(null)
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  async function emitir() {
    if (!vista) return
    setEmitiendo(true)
    setError(null)
    try {
      const l = await liquidaciones.emitir({
        propietario_id: Number(propietario),
        fecha,
        hasta,
        moneda: vista.moneda,
        observaciones: observaciones.trim() || null,
      })
      navigate(`/liquidaciones/${l.id}`)
    } catch (e) {
      setError(mensajeDeError(e))
      setEmitiendo(false)
    }
  }

  // La otra moneda en la que este propietario también tiene movimientos sin liquidar (si la hay).
  const otraMoneda = vista?.monedas_con_pendientes.find((m) => m !== vista.moneda) ?? null
  const sinMovimientos = vista !== null && vista.items.length === 0
  const netoNegativo = vista !== null && esNegativo(vista.neto)
  const puedeEmitir = vista !== null && !sinMovimientos && !netoNegativo && !emitiendo

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FileSpreadsheet}
        acciones={
          <Button asChild variant="outline">
            <Link to="/liquidaciones">
              <ArrowLeft className="size-4" />
              Volver
            </Link>
          </Button>
        }
      >
        Nueva liquidación
      </TituloPantalla>
      <p className="text-sm text-muted-foreground">
        Lo cobrado a favor del propietario, menos los gastos que se le cargaron, menos la comisión de administración. Previsualizá primero:
        no se escribe nada hasta que emitas.
      </p>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="propietario-de-la-liquidacion">Propietario</Label>
              <SelectCliente
                id="propietario-de-la-liquidacion"
                value={propietario}
                onChange={(v) => {
                  setPropietario(v)
                  descartar()
                }}
                opciones={opciones}
                placeholder="Buscar propietario…"
                ariaLabel="Propietario"
                entidad="propietario"
                campos={CAMPOS_CLIENTE_DEL_MOTOR}
                crear={crear}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fecha-de-la-liquidacion">Fecha de la liquidación</Label>
              <Input
                id="fecha-de-la-liquidacion"
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value)
                  descartar()
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="moneda-de-la-liquidacion">Moneda</Label>
              <SelectCerrado
                id="moneda-de-la-liquidacion"
                value={moneda}
                onChange={(v) => {
                  setMoneda(v)
                  descartar()
                }}
                opciones={MONEDAS}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="liquidar-hasta">Liquidar hasta</Label>
              <Input
                id="liquidar-hasta"
                type="date"
                value={hasta}
                max={fecha}
                onChange={(e) => {
                  setHasta(e.target.value)
                  descartar()
                }}
              />
            </div>
          </div>
          {hastaPosterior && (
            <p role="alert" className="text-sm text-destructive">
              No se liquida lo que todavía no pasó: «hasta» no puede ser posterior a la fecha de la liquidación.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void previsualizar()} disabled={!datosValidos || cargando}>
              <Eye className="size-4" />
              {cargando ? 'Calculando…' : 'Previsualizar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AvisoDeError mensaje={error ?? errorDeClientes} />

      {vista && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {vista.propietario_nombre} — hasta el {verFecha(vista.hasta)}, en {nombreDeMoneda(vista.moneda)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {otraMoneda && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>Este propietario también tiene movimientos sin liquidar en {nombreDeMoneda(otraMoneda)}.</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cargando}
                  onClick={() => {
                    setMoneda(otraMoneda)
                    void previsualizar(otraMoneda)
                  }}
                >
                  Liquidar en {nombreDeMoneda(otraMoneda)}
                </Button>
              </div>
            )}
            {sinMovimientos ? (
              <p className="text-sm text-muted-foreground">No hay movimientos sin liquidar en {nombreDeMoneda(vista.moneda)} para este propietario hasta esa fecha.</p>
            ) : (
              <>
                <TotalesDeLiquidacionVista totales={vista} moneda={vista.moneda} />
                <ItemsDeLiquidacion items={vista.items} moneda={vista.moneda} />
              </>
            )}
            {netoNegativo && (
              <p role="alert" className="text-sm text-destructive">
                Los gastos y la comisión superan lo cobrado ({pesos(vista.neto, vista.moneda)}): no se emite una liquidación con neto negativo. La deuda
                del propietario con la inmobiliaria todavía no tiene una regla para llevarla a la liquidación siguiente.
              </p>
            )}
            {!sinMovimientos && (
              <div className="grid gap-1.5">
                <Label htmlFor="observaciones-de-la-liquidacion">Observaciones</Label>
                <Textarea
                  id="observaciones-de-la-liquidacion"
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end">
              <Button disabled={!puedeEmitir} onClick={() => setConfirmando(true)}>
                {emitiendo ? 'Emitiendo…' : 'Emitir la liquidación'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Emitir la liquidación?"
        description={
          vista
            ? `Neto a pagar a ${vista.propietario_nombre}: ${pesos(vista.neto, vista.moneda)}. Los movimientos quedan liquidados y se carga la comisión (${pesos(vista.comision, vista.moneda)}) en su cuenta. Si te equivocás, una liquidación emitida y sin pagar se puede anular.`
            : undefined
        }
        confirmLabel="Emitir liquidación"
        onConfirm={() => {
          setConfirmando(false)
          void emitir()
        }}
      />
    </div>
  )
}
