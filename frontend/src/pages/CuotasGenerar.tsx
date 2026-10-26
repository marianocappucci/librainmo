/**
 * Las cuotas del mes: elegir el mes, previsualizar lo que se generaría, cargar las expensas variables de cada contrato y generar
 * (ADR-005, punto 3).
 *
 * 🔑 **Con confirmación humana.** «Previsualizar» no escribe nada (`POST /api/cuotas/previsualizar`); «Generar» pide confirmación y manda
 * los contratos tildados —no «todos los del mes»— con los importes de las expensas escritos acá. Lo que se generó se ve igual que lo
 * previsualizado, porque el `POST` lleva los mismos ids.
 *
 * Tres listas, porque son tres cosas distintas:
 *   - **a generar** (`propuestas`): con alquiler, prorrateo, conceptos fijos y un campo por cada concepto variable;
 *   - **ya generadas** (`ya_generadas`): el mes ya tiene su cuota, con enlace a ella (generar es idempotente);
 *   - **bloqueadas** (`bloqueadas`): un ajuste pendiente frena la cuota de ese contrato hasta aplicarlo, con el motivo y un enlace al
 *     contrato, donde está la tarjeta del ajuste.
 *
 * 🔴 Los importes no pasan por `number`: las expensas se escriben como una persona (`18.500,50`) y viajan como texto decimal; el total
 * de cada cuota se suma en centavos enteros.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Eye } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cuotas, mensajeDeError } from '@/lib/api'
import type { Cuota, PrevisualizacionDeCuotas, PropuestaDeCuota } from '@/lib/api'
import { fecha, hoyISO, mesDe, nombreDelMes, primerDiaDelMes } from '@/lib/fechas'
import { deCentesimas, importePositivo, pesos, sumarEnCentavos } from '@/lib/importes'

/** El total de una cuota propuesta: el alquiler, los conceptos fijos y las expensas escritas. `null` si alguna está mal escrita. */
function totalDeLaPropuesta(p: PropuestaDeCuota, variables: Record<number, string>): string | null {
  const escritas: string[] = []
  for (const v of p.variables) {
    const texto = (variables[v.concepto_id] ?? '').trim()
    if (texto === '') continue
    const importe = importePositivo(texto)
    if (importe === null) return null
    escritas.push(importe)
  }
  const total = sumarEnCentavos([p.alquiler, ...p.conceptos.map((c) => c.importe), ...escritas])
  return total === null ? null : deCentesimas(total)
}

export function CuotasGenerar() {
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [vista, setVista] = useState<PrevisualizacionDeCuotas | null>(null)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [variables, setVariables] = useState<Record<number, string>>({})
  const [cargando, setCargando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [generadas, setGeneradas] = useState<Cuota[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function cambiarMes(nuevo: string) {
    // Lo previsualizado era de otro mes: no se puede generar con eso.
    setMes(nuevo)
    setVista(null)
    setGeneradas(null)
    setError(null)
  }

  async function previsualizar() {
    setCargando(true)
    setError(null)
    setGeneradas(null)
    try {
      const v = await cuotas.previsualizar({ ancla: primerDiaDelMes(mes) })
      setVista(v)
      setElegidos(new Set(v.propuestas.map((p) => p.contrato_id)))
      setVariables({})
    } catch (e) {
      setVista(null)
      setError(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  const propuestas = vista?.propuestas ?? []
  const aGenerar = propuestas.filter((p) => elegidos.has(p.contrato_id))
  const totales = aGenerar.map((p) => totalDeLaPropuesta(p, variables))
  const hayErrorEnExpensas = totales.some((t) => t === null)
  const totalGeneral = hayErrorEnExpensas ? null : sumarEnCentavos(totales as string[])

  async function generar() {
    if (!vista || aGenerar.length === 0 || hayErrorEnExpensas) return
    setGenerando(true)
    setError(null)
    try {
      // Sólo los importes de los conceptos variables de los contratos tildados, y sólo los escritos.
      const importes: Record<string, string> = {}
      for (const p of aGenerar) {
        for (const v of p.variables) {
          const texto = (variables[v.concepto_id] ?? '').trim()
          if (texto !== '') importes[String(v.concepto_id)] = importePositivo(texto) ?? ''
        }
      }
      const r = await cuotas.generar({
        ancla: primerDiaDelMes(mes),
        contrato_ids: aGenerar.map((p) => p.contrato_id),
        variables: importes,
      })
      setGeneradas(r.generadas)
      setVista(null)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGenerando(false)
    }
  }

  const volver = (
    <Button asChild variant="outline">
      <Link to="/cuotas">
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  return (
    <div className="space-y-3">
      <TituloPantalla icono={CalendarClock} acciones={volver}>
        Generar las cuotas del mes
      </TituloPantalla>
      <p className="text-sm text-muted-foreground">
        Elegí el mes y previsualizá: no se escribe nada hasta que confirmes. La cuota de cada contrato vigente es el alquiler del mes
        (prorrateado si el contrato empieza o termina en él) más los conceptos que paga el inquilino.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="mes-de-cuotas" className="text-xs text-muted-foreground">Mes</Label>
          <Input id="mes-de-cuotas" type="month" value={mes} onChange={(e) => cambiarMes(e.target.value)} className="w-44" />
        </div>
        <Button onClick={() => void previsualizar()} disabled={!mes || cargando}>
          <Eye className="size-4" />
          {cargando ? 'Calculando…' : 'Previsualizar'}
        </Button>
      </div>

      <AvisoDeError mensaje={error} />

      {generadas && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {generadas.length === 0
                ? 'No se generó ninguna cuota'
                : `Se ${generadas.length === 1 ? 'generó 1 cuota' : `generaron ${generadas.length} cuotas`} de ${nombreDelMes(primerDiaDelMes(mes))}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1">
              {generadas.map((c) => (
                <li key={c.id}>
                  <Link to={`/cuotas/${c.id}`} className="underline underline-offset-4">
                    {c.numero_contrato}
                  </Link>{' '}
                  · {c.inquilino_nombre} · {pesos(c.total)}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">Las expensas que faltaban se cargan después, desde la ficha de cada cuota («Cargar un cargo»).</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/cuotas">Ver el listado de cuotas</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {vista && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Para generar — {nombreDelMes(vista.periodo_desde)} ({fecha(vista.periodo_desde)} al {fecha(vista.periodo_hasta)})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {propuestas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cuotas para generar en este mes.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><span className="sr-only">Generar</span></TableHead>
                        <TableHead>Contrato</TableHead>
                        <TableHead>Emite y vence</TableHead>
                        <TableHead className="text-right">Alquiler</TableHead>
                        <TableHead>Conceptos del mes</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {propuestas.map((p) => {
                        const total = totalDeLaPropuesta(p, variables)
                        return (
                          <TableRow key={p.contrato_id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                aria-label={`Generar la cuota de ${p.numero}`}
                                checked={elegidos.has(p.contrato_id)}
                                onChange={(e) =>
                                  setElegidos((previos) => {
                                    const nuevos = new Set(previos)
                                    if (e.target.checked) nuevos.add(p.contrato_id)
                                    else nuevos.delete(p.contrato_id)
                                    return nuevos
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Link to={`/contratos/${p.contrato_id}`} className="font-medium underline-offset-4 hover:underline">
                                {p.numero}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {fecha(p.fecha_emision)}
                              <span className="text-muted-foreground"> · vence {fecha(p.fecha_vencimiento)}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              {pesos(p.alquiler)}
                              {p.prorrateada && (
                                <div className="text-xs text-muted-foreground">
                                  prorrateo: {p.dias_cubiertos} de {p.dias_del_periodo} días
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="min-w-64 space-y-2 text-sm">
                              {p.conceptos.map((c) => (
                                <div key={c.concepto_id} className="flex justify-between gap-3">
                                  <span>{c.descripcion}</span>
                                  <span>{pesos(c.importe)}</span>
                                </div>
                              ))}
                              {p.variables.map((v) => {
                                const texto = variables[v.concepto_id] ?? ''
                                const malEscrito = texto.trim() !== '' && importePositivo(texto) === null
                                return (
                                  <div key={v.concepto_id} className="flex items-center justify-between gap-3">
                                    <label htmlFor={`variable-${v.concepto_id}`}>{v.descripcion}</label>
                                    <Input
                                      id={`variable-${v.concepto_id}`}
                                      aria-label={`${v.descripcion} de ${p.numero}`}
                                      aria-invalid={malEscrito}
                                      inputMode="decimal"
                                      placeholder="Variable"
                                      autoComplete="off"
                                      value={texto}
                                      onChange={(e) => setVariables((previas) => ({ ...previas, [v.concepto_id]: e.target.value }))}
                                      className="h-8 w-32 text-right"
                                    />
                                  </div>
                                )
                              })}
                              {p.variables.some((v) => importePositivo(variables[v.concepto_id] ?? '') === null && (variables[v.concepto_id] ?? '').trim() !== '') && (
                                <p role="alert" className="text-xs text-destructive">Escribí el importe con hasta dos decimales, mayor que cero.</p>
                              )}
                              {p.conceptos.length === 0 && p.variables.length === 0 && <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-medium">{total === null ? '—' : pesos(total)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {propuestas.some((p) => p.variables.length > 0) && (
                <p className="text-sm text-muted-foreground">
                  Los conceptos variables que dejes vacíos no entran: se cargan después en la cuota, mientras esté pendiente.
                </p>
              )}
              {propuestas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {aGenerar.length} de {propuestas.length} {propuestas.length === 1 ? 'cuota' : 'cuotas'} tildadas
                    {totalGeneral !== null && <> · total {pesos(deCentesimas(totalGeneral))}</>}
                  </p>
                  <Button disabled={aGenerar.length === 0 || hayErrorEnExpensas || generando} onClick={() => setConfirmando(true)}>
                    {generando ? 'Generando…' : 'Generar cuotas'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {vista.ya_generadas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ya generadas</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {vista.ya_generadas.map((g) => (
                    <li key={g.cuota_id}>
                      {g.numero} ·{' '}
                      <Link to={`/cuotas/${g.cuota_id}`} className="underline underline-offset-4">
                        ver la cuota
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {vista.bloqueadas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bloqueadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">No se generan hasta resolver lo que dice cada una.</p>
                <ul className="space-y-1">
                  {vista.bloqueadas.map((b) => (
                    <li key={b.contrato_id}>
                      <Link to={`/contratos/${b.contrato_id}`} className="font-medium underline underline-offset-4">
                        {b.numero}
                      </Link>
                      : {b.motivo}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title={`¿Generar ${aGenerar.length === 1 ? '1 cuota' : `${aGenerar.length} cuotas`} de ${nombreDelMes(primerDiaDelMes(mes))}?`}
        description={`${totalGeneral !== null ? `Suman ${pesos(deCentesimas(totalGeneral))}. ` : ''}Cada cuota es un cargo en la cuenta del inquilino. Si te equivocás, una cuota pendiente se puede anular y volver a generar.`}
        confirmLabel="Generar cuotas"
        onConfirm={() => {
          setConfirmando(false)
          void generar()
        }}
      />
    </div>
  )
}
