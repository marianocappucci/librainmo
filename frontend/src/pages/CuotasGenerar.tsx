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
 *
 * 🔑 **Cada cuota va en la moneda de su contrato** (`$` o `US$`) y el total de la pantalla es **uno por moneda**: nunca se suman pesos con
 * dólares. Si un ajuste cae a mitad de mes, el alquiler viene partido en `tramos` (uno por precio) y se muestran todos. Los conceptos que
 * paga el propietario no son parte de la cuota: se cargan solos como gasto (`gastos_del_propietario`), o quedan para cargarlos a mano
 * cuando llega el importe (`a_cargar_como_gasto`, con enlace a `/gastos`).
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
import { nombreDeMoneda } from '@/lib/dominio'
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

/** Los totales de las cuotas tildadas, uno por moneda (en el orden en que aparecen). `null` si alguna expensa está mal escrita. */
function totalesPorMoneda(propuestas: PropuestaDeCuota[], totales: (string | null)[]): { moneda: string; total: string }[] | null {
  const monedas: string[] = []
  for (const p of propuestas) if (!monedas.includes(p.moneda)) monedas.push(p.moneda)
  const salida: { moneda: string; total: string }[] = []
  for (const moneda of monedas) {
    const delaMoneda = totales.filter((_, i) => propuestas[i].moneda === moneda)
    const suma = sumarEnCentavos(delaMoneda as string[])
    if (delaMoneda.some((t) => t === null) || suma === null) return null
    salida.push({ moneda, total: deCentesimas(suma) })
  }
  return salida
}

/** `$ 1.000,00` o `$ 1.000,00 y US$ 500,00`: los totales por moneda en una frase. */
function enFrase(totales: { moneda: string; total: string }[]): string {
  return totales.map((t) => pesos(t.total, t.moneda)).join(' y ')
}

/** Lo que paga el propietario de las cuotas a generar, con el número de cada contrato. */
type DelPropietario = { numero: string; descripcion: string; moneda: string; importe: string | null }

export function CuotasGenerar() {
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [vista, setVista] = useState<PrevisualizacionDeCuotas | null>(null)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [variables, setVariables] = useState<Record<number, string>>({})
  const [cargando, setCargando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [generadas, setGeneradas] = useState<Cuota[] | null>(null)
  /** Lo que quedó para cargar como gasto a mano: se guarda al generar, porque la previsualización se descarta. */
  const [paraCargar, setParaCargar] = useState<DelPropietario[]>([])
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
    setParaCargar([])
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
  const totalesGenerales = hayErrorEnExpensas ? null : totalesPorMoneda(aGenerar, totales)
  const gastosDelPropietario: DelPropietario[] = aGenerar.flatMap((p) =>
    p.gastos_del_propietario.map((g) => ({ numero: p.numero, descripcion: g.descripcion, moneda: p.moneda, importe: g.importe })),
  )
  const aCargarComoGasto: DelPropietario[] = aGenerar.flatMap((p) =>
    p.a_cargar_como_gasto.map((g) => ({ numero: p.numero, descripcion: g.descripcion, moneda: p.moneda, importe: null })),
  )

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
      setParaCargar(aCargarComoGasto)
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
                  · {c.inquilino_nombre} · {pesos(c.total, c.moneda)}
                  {c.gastos_del_propietario.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · cargó {c.gastos_del_propietario.length === 1 ? '1 gasto' : `${c.gastos_del_propietario.length} gastos`} por cuenta del propietario
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">Las expensas que faltaban se cargan después, desde la ficha de cada cuota («Cargar un cargo»).</p>
            {paraCargar.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium">Para cargar como gasto cuando llegue el importe</p>
                <ul className="space-y-1">
                  {paraCargar.map((g) => (
                    <li key={`${g.numero}-${g.descripcion}`}>
                      {g.numero} · {g.descripcion} ({nombreDeMoneda(g.moneda)})
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" size="sm">
                  <Link to="/gastos">Ir a los gastos</Link>
                </Button>
              </div>
            )}
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
                              {pesos(p.alquiler, p.moneda)}
                              {p.tramos.length > 1 && (
                                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground" aria-label={`Tramos del alquiler de ${p.numero}`}>
                                  {p.tramos.map((t) => (
                                    <li key={t.precio_id}>
                                      del {fecha(t.desde)} al {fecha(t.hasta)} ({t.dias} {t.dias === 1 ? 'día' : 'días'}
                                      {t.ajuste ? ', con el ajuste' : ''}): {pesos(t.importe, p.moneda)}
                                    </li>
                                  ))}
                                </ul>
                              )}
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
                                  <span>{pesos(c.importe, p.moneda)}</span>
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
                            <TableCell className="text-right font-medium">{total === null ? '—' : pesos(total, p.moneda)}</TableCell>
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
                    {totalesGenerales !== null && totalesGenerales.length > 0 && <> · total {enFrase(totalesGenerales)}</>}
                  </p>
                  <Button disabled={aGenerar.length === 0 || hayErrorEnExpensas || generando} onClick={() => setConfirmando(true)}>
                    {generando ? 'Generando…' : 'Generar cuotas'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {(gastosDelPropietario.length > 0 || aCargarComoGasto.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lo que paga el propietario</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {gastosDelPropietario.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Gastos del propietario que se cargan</p>
                    <p className="text-muted-foreground">
                      Al generar se cargan solos como gasto por su cuenta y se descuentan en su liquidación. No suman a la cuota del inquilino.
                    </p>
                    <ul className="space-y-1">
                      {gastosDelPropietario.map((g) => (
                        <li key={`${g.numero}-${g.descripcion}`}>
                          {g.numero} · {g.descripcion}: {pesos(g.importe, g.moneda)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {aCargarComoGasto.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Para cargar como gasto cuando llegue el importe</p>
                    <p className="text-muted-foreground">
                      No tienen importe fijo: no se cargan solos. Cuando llegue el monto, cargalo en{' '}
                      <Link to="/gastos" className="underline underline-offset-4">
                        Gastos
                      </Link>
                      .
                    </p>
                    <ul className="space-y-1">
                      {aCargarComoGasto.map((g) => (
                        <li key={`${g.numero}-${g.descripcion}`}>
                          {g.numero} · {g.descripcion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
        description={`${totalesGenerales !== null && totalesGenerales.length > 0 ? `Suman ${enFrase(totalesGenerales)}. ` : ''}Cada cuota es un cargo en la cuenta del inquilino. Si te equivocás, una cuota pendiente se puede anular y volver a generar.`}
        confirmLabel="Generar cuotas"
        onConfirm={() => {
          setConfirmando(false)
          void generar()
        }}
      />
    </div>
  )
}
