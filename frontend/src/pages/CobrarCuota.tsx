/**
 * Cobrar una cuota: la fecha, el punitorio que corresponde a ese día, los medios de pago y el recibo (ADR-006).
 *
 * 🔑 **Por omisión se cobra lo que falta de la cuota más el punitorio**: el total es un dato del servidor (`saldo` + `punitorio`) y los
 * medios tienen que sumar lo que se cobra al centavo. El punitorio lo calcula el motor (`GET /api/cuotas/{id}/cobro?fecha=`): la pantalla lo
 * vuelve a pedir cada vez que cambia la fecha, no lo calcula. «Condonar» lo saca del total (queda la constancia de cuánto era).
 *
 * 🔑 **Se puede pagar a cuenta** (ADR-010): «Importe a cobrar» arranca en el total y se puede bajar. Lo pagado va primero al punitorio adeudado
 * y el resto a la cuota, que sigue pendiente con su saldo. El `importe` sólo viaja si es menor al total: sin él, el servidor cobra todo. Una
 * cuota con pagos anteriores muestra lo ya pagado, el saldo y el punitorio que un pago no alcanzó a cubrir (`punitorio_arrastrado`).
 *
 * 🔴 Todo en centavos enteros: el total de los medios se suma sin `number` con decimales, y el botón no se habilita hasta que cierra al
 * centavo con el importe a cobrar.
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
import { DESTINOS_DE_PUNITORIO, MEDIOS_DE_COBRO, esPagoACuenta, etiquetaDe } from '@/lib/dominio'
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
  // Lo que se escribió en «Importe a cobrar»; `null` mientras no se toca: sigue al total.
  const [importeEscrito, setImporteEscrito] = useState<string | null>(null)
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

  // La moneda del contrato, de la cuota (que carga antes que la propuesta y no depende de la fecha): mientras carga, pesos.
  const moneda = cuota?.moneda ?? 'ARS'
  const conPunitorio = propuesta !== null && aCentesimas(propuesta.punitorio) !== 0
  // El total a cobrar, lo máximo: lo que dice el servidor, sin el punitorio si se condona (queda el saldo de la cuota).
  const total = propuesta ? (condonar ? propuesta.saldo : propuesta.total) : null
  const totalEnCentavos = total === null ? null : aCentesimas(total)
  const conPagos = propuesta !== null && aCentesimas(propuesta.pagado) !== 0
  const punitorioArrastrado = propuesta !== null && aCentesimas(propuesta.punitorio_arrastrado) !== 0

  // Lo que se cobra: el total, o lo que se escribió si es válido (mayor que cero y no más que el total). `null` si lo escrito no sirve.
  const aCobrar = importeEscrito === null ? total : importePositivo(importeEscrito)
  const aCobrarEnCentavos = aCobrar === null ? null : aCentesimas(aCobrar)
  const importeFueraDeRango =
    aCobrarEnCentavos !== null && totalEnCentavos !== null && aCobrarEnCentavos > totalEnCentavos
  const importeValido = aCobrarEnCentavos !== null && totalEnCentavos !== null && !importeFueraDeRango
  // Un pago a cuenta es cobrar menos que el total: sólo entonces viaja `importe`.
  const aCuenta = importeValido && aCobrarEnCentavos < (totalEnCentavos ?? 0)

  // Cómo se reparte un pago a cuenta: primero el punitorio adeudado y el resto a la cuota (ADR-010).
  const reparto = useMemo(() => {
    if (!aCuenta || propuesta === null || aCobrarEnCentavos === null) return null
    const punitorioEnCentavos = condonar ? 0 : (aCentesimas(propuesta.punitorio) ?? 0)
    const alPunitorio = Math.min(aCobrarEnCentavos, punitorioEnCentavos)
    const aLaCuotaEnCentavos = aCobrarEnCentavos - alPunitorio
    return {
      alPunitorio,
      aLaCuota: aLaCuotaEnCentavos,
      saldo: (aCentesimas(propuesta.saldo) ?? 0) - aLaCuotaEnCentavos,
      punitorioSinCubrir: punitorioEnCentavos - alPunitorio,
    }
  }, [aCuenta, propuesta, aCobrarEnCentavos, condonar])

  // Con un solo medio que no se tocó, el monto sigue a lo que se cobra (lo más común: un solo pago por el total).
  useEffect(() => {
    if (!importeValido || aCobrar === null) return
    setFilas((previas) =>
      previas.length === 1 && !previas[0].tocado ? [{ ...previas[0], monto: numeroArgentino(aCobrar, 2) }] : previas,
    )
  }, [importeValido, aCobrar])

  const montos = filas.map((f) => importePositivo(f.monto))
  const sumaEnCentavos = montos.every((m) => m !== null)
    ? (montos as string[]).reduce((suma, m) => suma + (aCentesimas(m) ?? 0), 0)
    : null
  const diferencia = importeValido && sumaEnCentavos !== null ? aCobrarEnCentavos - sumaEnCentavos : null
  const antesDeEmitir = cuota !== null && ISO.test(fecha) && fecha < cuota.fecha_emision
  const puedeCobrar =
    propuesta !== null &&
    !cargandoPropuesta &&
    !antesDeEmitir &&
    ISO.test(fecha) &&
    importeValido &&
    diferencia === 0 &&
    filas.every((f) => f.medio !== '')

  const resumenDeLaDiferencia = useMemo(() => {
    if (!importeValido) return 'Corregí el importe a cobrar para sumar los medios.'
    if (diferencia === null) return 'Escribí el monto de cada medio, con hasta dos decimales.'
    if (diferencia === 0) return aCuenta ? 'Los medios cierran con el importe a cobrar.' : 'Los medios cierran con el total.'
    const de = aCuenta ? 'del importe a cobrar' : 'del total'
    return diferencia > 0
      ? `Falta cobrar ${pesos(deCentesimas(diferencia), moneda)}.`
      : `Los medios se pasan ${de} por ${pesos(deCentesimas(-diferencia), moneda)}.`
  }, [importeValido, aCuenta, diferencia, moneda])

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
          ...(aCuenta && aCobrar !== null ? { importe: aCobrar } : {}),
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
            <CardTitle className="text-base">Cobro de {pesos(cobro.total, cobro.moneda)} el {verFecha(cobro.fecha)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {cobro.recibo && (
              <p>
                Recibo N° {cobro.recibo.numero}
                {cobro.recibo.punto_venta ? ` (punto de venta ${cobro.recibo.punto_venta})` : ''}.
              </p>
            )}
            {esPagoACuenta(cobro) && (
              <p>
                Fue un pago a cuenta: la cuota sigue pendiente con su saldo.
                {aCentesimas(cobro.punitorio_pendiente) !== 0 &&
                  ` Quedaron ${pesos(cobro.punitorio_pendiente, cobro.moneda)} de punitorio sin cubrir, que se arrastran al próximo cobro.`}
              </p>
            )}
            {aCentesimas(cobro.punitorio_condonado) !== 0 && (
              <p className="text-muted-foreground">Se condonó un punitorio de {pesos(cobro.punitorio_condonado, cobro.moneda)}.</p>
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
                    <dd className="text-sm">{pesos(propuesta.importe_cuota, moneda)}</dd>
                  </div>
                  {conPagos && (
                    <>
                      <div>
                        <dt className="text-xs text-muted-foreground">Ya pagado a cuenta</dt>
                        <dd className="text-sm">{pesos(propuesta.pagado, moneda)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Saldo de la cuota</dt>
                        <dd className="text-sm">{pesos(propuesta.saldo, moneda)}</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt className="text-xs text-muted-foreground">Punitorio</dt>
                    <dd className="text-sm">
                      {condonar ? <span className="line-through">{pesos(propuesta.punitorio, moneda)}</span> : pesos(propuesta.punitorio, moneda)}
                      {propuesta.dias_de_atraso > 0 && (
                        <span className="text-muted-foreground">
                          {' '}· {propuesta.dias_de_atraso} {propuesta.dias_de_atraso === 1 ? 'día' : 'días'} de atraso
                        </span>
                      )}
                      {punitorioArrastrado && (
                        <div className="text-xs text-muted-foreground">
                          Incluye {pesos(propuesta.punitorio_arrastrado, moneda)} que un pago anterior no alcanzó a cubrir.
                        </div>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Vencimiento efectivo</dt>
                    <dd className="text-sm">{verFecha(propuesta.vencimiento_efectivo)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Total a cobrar</dt>
                    <dd className="text-base font-semibold">{pesos(total, moneda)}</dd>
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
              {propuesta && (
                <div className="space-y-1">
                  <div className="grid gap-1.5 sm:w-56">
                    <Label htmlFor="importe-a-cobrar">Importe a cobrar</Label>
                    <Input
                      id="importe-a-cobrar"
                      inputMode="decimal"
                      value={importeEscrito ?? numeroArgentino(total, 2)}
                      aria-invalid={!importeValido}
                      onChange={(e) => setImporteEscrito(e.target.value)}
                      autoComplete="off"
                      className="text-right"
                    />
                  </div>
                  {importeEscrito !== null && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setImporteEscrito(null)}>
                      Cobrar el total
                    </Button>
                  )}
                  {importeEscrito !== null && !importeValido && (
                    <p role="alert" className="text-sm text-destructive">
                      {importeFueraDeRango
                        ? `No se cobra más de lo que se debe (${pesos(total, moneda)}).`
                        : 'El importe a cobrar tiene que ser un monto mayor que cero, con hasta dos decimales.'}
                    </p>
                  )}
                  {reparto && (
                    <p role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      Es un pago a cuenta: va primero al punitorio adeudado ({pesos(deCentesimas(reparto.alPunitorio), moneda)}) y el resto a la
                      cuota ({pesos(deCentesimas(reparto.aLaCuota), moneda)}). La cuota sigue pendiente con un saldo de{' '}
                      {pesos(deCentesimas(reparto.saldo), moneda)}
                      {reparto.punitorioSinCubrir > 0 &&
                        `, y quedan ${pesos(deCentesimas(reparto.punitorioSinCubrir), moneda)} de punitorio sin cubrir, que se arrastran al próximo cobro`}
                      .
                    </p>
                  )}
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
                  <span className="font-medium">{sumaEnCentavos === null ? '—' : pesos(deCentesimas(sumaEnCentavos), moneda)}</span>
                  <span className="text-muted-foreground"> de {aCobrar === null || !importeValido ? '—' : pesos(aCobrar, moneda)}</span>
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
