/**
 * Cobrar una cuota: la fecha, el punitorio que corresponde a ese día, los medios de pago y el recibo (ADR-006).
 *
 * 🔑 **Se cobra la cuota entera más el punitorio** (el pago parcial no está en esta tanda): por eso el total es un dato del servidor y los
 * medios tienen que sumarlo exacto. El punitorio lo calcula el motor (`GET /api/cuotas/{id}/cobro?fecha=`): la pantalla lo vuelve a pedir
 * cada vez que cambia la fecha, no lo calcula. «Condonar» lo saca del total (queda la constancia de cuánto era).
 *
 * 🔴 Todo en centavos enteros: el total de los medios se suma sin `number` con decimales, y el botón no se habilita hasta que cierra al
 * centavo.
 *
 * Al cobrar no se navega: se queda en una confirmación con el recibo (el PDF se abre en otra pestaña) y los enlaces para seguir.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, FileDown, Plus, Trash2 } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { AvisoDeError } from '@/components/listado'
import { SelectCerrado } from '@/components/SelectCerrado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cobros, cuotas, mensajeDeError, urlDelRecibo } from '@/lib/api'
import type { Cobro, Cuota, PropuestaDeCobro } from '@/lib/api'
import { DESTINOS_DE_PUNITORIO, MEDIOS_DE_COBRO, etiquetaDe } from '@/lib/dominio'
import { fecha as verFecha, hoyISO, nombreDelMes } from '@/lib/fechas'
import { aCentesimas, deCentesimas, importePositivo, numeroArgentino, pesos } from '@/lib/importes'

type Fila = { clave: number; medio: string; referencia: string; monto: string; tocado: boolean }

let siguienteClave = 1
const filaNueva = (monto = ''): Fila => ({ clave: siguienteClave++, medio: 'efectivo', referencia: '', monto, tocado: false })

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function CobrarCuota() {
  const { id } = useParams()
  const [cuota, setCuota] = useState<Cuota | null>(null)
  const [propuesta, setPropuesta] = useState<PropuestaDeCobro | null>(null)
  const [fecha, setFecha] = useState(hoyISO())
  const [condonar, setCondonar] = useState(false)
  const [filas, setFilas] = useState<Fila[]>(() => [filaNueva()])
  const [cargandoPropuesta, setCargandoPropuesta] = useState(false)
  const [cobrando, setCobrando] = useState(false)
  const [cobro, setCobro] = useState<Cobro | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    cuotas
      .obtener(Number(id))
      .then((q) => vigente && setCuota(q))
      .catch((e: unknown) => vigente && setErrorDeCarga(mensajeDeError(e)))
    return () => {
      vigente = false
    }
  }, [id])

  // El punitorio depende de la fecha: se vuelve a pedir cada vez que cambia. Una respuesta vieja no pisa a una nueva.
  useEffect(() => {
    if (!ISO.test(fecha)) return
    let vigente = true
    setCargandoPropuesta(true)
    cobros
      .proponer(Number(id), fecha)
      .then((p) => {
        if (!vigente) return
        setPropuesta(p)
        setErrorDeCarga(null)
      })
      .catch((e: unknown) => {
        if (!vigente) return
        setPropuesta(null)
        setErrorDeCarga(mensajeDeError(e))
      })
      .finally(() => vigente && setCargandoPropuesta(false))
    return () => {
      vigente = false
    }
  }, [id, fecha])

  const conPunitorio = propuesta !== null && aCentesimas(propuesta.punitorio) !== 0
  // El total a cobrar: lo que dice el servidor, sin el punitorio si se condona.
  const total = propuesta ? (condonar ? propuesta.importe_cuota : propuesta.total) : null
  const totalEnCentavos = total === null ? null : aCentesimas(total)

  // Con un solo medio que no se tocó, el monto sigue al total (lo más común: un solo pago por el total).
  useEffect(() => {
    if (total === null) return
    setFilas((previas) =>
      previas.length === 1 && !previas[0].tocado ? [{ ...previas[0], monto: numeroArgentino(total, 2) }] : previas,
    )
  }, [total])

  const montos = filas.map((f) => importePositivo(f.monto))
  const sumaEnCentavos = montos.every((m) => m !== null)
    ? (montos as string[]).reduce((suma, m) => suma + (aCentesimas(m) ?? 0), 0)
    : null
  const diferencia = totalEnCentavos !== null && sumaEnCentavos !== null ? totalEnCentavos - sumaEnCentavos : null
  const antesDeEmitir = cuota !== null && ISO.test(fecha) && fecha < cuota.fecha_emision
  const puedeCobrar =
    propuesta !== null && !cargandoPropuesta && !antesDeEmitir && ISO.test(fecha) && diferencia === 0 && filas.every((f) => f.medio !== '')

  const resumenDeLaDiferencia = useMemo(() => {
    if (diferencia === null) return 'Escribí el monto de cada medio, con hasta dos decimales.'
    if (diferencia === 0) return 'Los medios cierran con el total.'
    return diferencia > 0
      ? `Falta cobrar ${pesos(deCentesimas(diferencia))}.`
      : `Los medios se pasan del total por ${pesos(deCentesimas(-diferencia))}.`
  }, [diferencia])

  function cambiar(clave: number, parcial: Partial<Fila>) {
    setFilas((previas) => previas.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)))
  }

  async function cobrar() {
    if (!puedeCobrar) return
    setCobrando(true)
    setError(null)
    try {
      setCobro(
        await cobros.cobrar(Number(id), {
          fecha,
          condonar_punitorio: condonar,
          medios: filas.map((f, i) => ({
            medio_pago: f.medio,
            referencia: f.referencia.trim() || null,
            monto: montos[i] ?? '',
          })),
        }),
      )
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setCobrando(false)
    }
  }

  const volver = (
    <Button asChild variant="outline">
      <Link to={`/cuotas/${id}`}>
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  if (cobro) {
    return (
      <div className="space-y-3">
        <TituloPantalla icono={CalendarClock}>Cobro registrado</TituloPantalla>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobro de {pesos(cobro.total)} el {verFecha(cobro.fecha)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {cobro.recibo && (
              <p>
                Recibo N° {cobro.recibo.numero}
                {cobro.recibo.punto_venta ? ` (punto de venta ${cobro.recibo.punto_venta})` : ''}.
              </p>
            )}
            {aCentesimas(cobro.punitorio_condonado) !== 0 && (
              <p className="text-muted-foreground">Se condonó un punitorio de {pesos(cobro.punitorio_condonado)}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={urlDelRecibo(cobro.id)} target="_blank" rel="noopener noreferrer">
                  <FileDown className="size-4" />
                  Abrir el recibo (PDF)
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link to={`/cobros/${cobro.id}`}>Ver el cobro</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/cuotas">Volver a las cuotas</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <TituloPantalla icono={CalendarClock} acciones={volver}>
        {cuota ? `Cobrar la cuota de ${nombreDelMes(cuota.periodo_desde)}` : 'Cobrar una cuota'}
      </TituloPantalla>
      {cuota && (
        <p className="text-sm text-muted-foreground">
          {cuota.numero_contrato} · {cuota.inquilino_nombre} · vence el {verFecha(cuota.fecha_vencimiento)}
        </p>
      )}

      <AvisoDeError mensaje={errorDeCarga} />

      {!cuota && !errorDeCarga && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {cuota && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cuánto se cobra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5 sm:w-56">
                <Label htmlFor="fecha-del-cobro">Fecha del cobro</Label>
                <Input id="fecha-del-cobro" type="date" value={fecha} min={cuota.fecha_emision} onChange={(e) => setFecha(e.target.value)} />
              </div>
              {antesDeEmitir && (
                <p role="alert" className="text-sm text-destructive">
                  No se cobra una cuota antes de emitirla ({verFecha(cuota.fecha_emision)}).
                </p>
              )}

              {propuesta && (
                <dl className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Cuota</dt>
                    <dd className="text-sm">{pesos(propuesta.importe_cuota)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Punitorio</dt>
                    <dd className="text-sm">
                      {condonar ? <span className="line-through">{pesos(propuesta.punitorio)}</span> : pesos(propuesta.punitorio)}
                      {propuesta.dias_de_atraso > 0 && (
                        <span className="text-muted-foreground">
                          {' '}· {propuesta.dias_de_atraso} {propuesta.dias_de_atraso === 1 ? 'día' : 'días'} de atraso
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Vencimiento efectivo</dt>
                    <dd className="text-sm">{verFecha(propuesta.vencimiento_efectivo)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Total a cobrar</dt>
                    <dd className="text-base font-semibold">{pesos(total)}</dd>
                  </div>
                </dl>
              )}
              {conPunitorio && propuesta && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={condonar} onChange={(e) => setCondonar(e.target.checked)} />
                    Condonar el punitorio
                  </label>
                  <p className="text-xs text-muted-foreground">
                    El punitorio es para {etiquetaDe(DESTINOS_DE_PUNITORIO, propuesta.punitorio_para).toLowerCase()}. Si se condona, no se
                    cobra y queda registrado cuánto era.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Con qué paga</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-3">
                {filas.map((f, i) => {
                  const n = i + 1
                  return (
                    <li key={f.clave} className="flex flex-wrap items-end gap-2">
                      <div className="grid w-56 gap-1.5">
                        <span className="text-xs text-muted-foreground">Medio {n}</span>
                        <SelectCerrado
                          value={f.medio}
                          onChange={(v) => cambiar(f.clave, { medio: v })}
                          opciones={MEDIOS_DE_COBRO}
                          ariaLabel={`Medio de pago ${n}`}
                          className="w-full"
                        />
                      </div>
                      <div className="grid min-w-48 flex-1 gap-1.5">
                        <label htmlFor={`referencia-${f.clave}`} className="text-xs text-muted-foreground">Referencia {n}</label>
                        <Input
                          id={`referencia-${f.clave}`}
                          value={f.referencia}
                          onChange={(e) => cambiar(f.clave, { referencia: e.target.value })}
                          placeholder="Opcional: N° de operación, cheque…"
                          autoComplete="off"
                          maxLength={120}
                        />
                      </div>
                      <div className="grid w-40 gap-1.5">
                        <label htmlFor={`monto-${f.clave}`} className="text-xs text-muted-foreground">Monto {n}</label>
                        <Input
                          id={`monto-${f.clave}`}
                          inputMode="decimal"
                          value={f.monto}
                          aria-invalid={f.monto.trim() !== '' && importePositivo(f.monto) === null}
                          onChange={(e) => cambiar(f.clave, { monto: e.target.value, tocado: true })}
                          placeholder="0,00"
                          autoComplete="off"
                          className="text-right"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Quitar medio"
                        aria-label={`Quitar medio ${n}`}
                        disabled={filas.length === 1}
                        onClick={() => setFilas((previas) => previas.filter((o) => o.clave !== f.clave))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFilas((previas) => [...previas, filaNueva()])}
                >
                  <Plus className="size-4" />
                  Agregar otro medio
                </Button>
                <p className="text-sm" aria-live="polite">
                  <span className="text-muted-foreground">Suma de los medios </span>
                  <span className="font-medium">{sumaEnCentavos === null ? '—' : pesos(deCentesimas(sumaEnCentavos))}</span>
                  <span className="text-muted-foreground"> de {total === null ? '—' : pesos(total)}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{resumenDeLaDiferencia}</p>
              <AvisoDeError mensaje={error} />
              <div className="flex justify-end">
                <Button disabled={!puedeCobrar || cobrando} onClick={() => void cobrar()}>
                  {cobrando ? 'Cobrando…' : 'Registrar el cobro'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
