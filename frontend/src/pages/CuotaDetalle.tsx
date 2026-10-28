/**
 * La ficha de una cuota: sus líneas (alquiler y conceptos), el total y lo que se puede hacer según su estado (ADR-005).
 *
 * Pendiente: «Cobrar», «Cargar un cargo» (las expensas que llegaron después de generarla) y «Anular» con motivo. Cobrada o anulada: sólo se
 * mira, y una cobrada enlaza al cobro. El total es lo que quedó cargado en la cuenta del inquilino; el servidor lo corrige al cargar un
 * cargo y lo contraasienta al anular. Los importes van en la moneda de la cuota (`$` o `US$`).
 *
 * Si el contrato tiene conceptos que paga el propietario, la cuota los lleva como gastos suyos («Gastos del propietario»): se cargaron
 * solos al generarla y se anulan con ella, por eso acá sólo se miran.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, HandCoins, Plus, XCircle } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { Dato } from '@/components/Dato'
import { DialogoDeCargo } from '@/components/DialogoDeCargo'
import { DialogoDeMotivo } from '@/components/DialogoDeMotivo'
import { Anulado, EstadoDeCuotaConSaldo } from '@/components/Estados'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cobros, contratos, cuotas, mensajeDeError } from '@/lib/api'
import type { ConceptoDelContrato, Cobro, Cuota } from '@/lib/api'
import { conPagosACuenta } from '@/lib/dominio'
import { fecha, nombreDelMes } from '@/lib/fechas'
import { pesos } from '@/lib/importes'

export function CuotaDetalle() {
  const { id } = useParams()
  const [cuota, setCuota] = useState<Cuota | null>(null)
  const [conceptos, setConceptos] = useState<ConceptoDelContrato[]>([])
  // Los cobros vivos de la cuota (si se pudieron traer): el último es el que enlaza una cobrada; todos, la lista de pagos a cuenta.
  const [losCobros, setLosCobros] = useState<Cobro[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [anulando, setAnulando] = useState(false)

  const cargar = useCallback(() => {
    cuotas
      .obtener(Number(id))
      .then(async (q) => {
        setCuota(q)
        setError(null)
        // El contrato da los conceptos para «Cargar un cargo»; los cobros, si ya se cobró algo, para enlazarlos y mostrar su fecha. Si alguno
        // falla, la ficha sigue siendo útil: se queda con lo que tiene. La moneda ya viene en la cuota.
        try {
          const c = await contratos.obtener(q.contrato_id)
          setConceptos(c.conceptos)
        } catch {
          /* la ficha no depende de esto */
        }
        if (q.estado === 'cobrada' || q.cobros.length > 0) {
          try {
            const lista = await cobros.listar({ contrato_id: q.contrato_id })
            setLosCobros(lista.filter((x) => x.cuota_id === q.id && !x.anulado))
          } catch {
            /* idem */
          }
        }
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [id])

  useEffect(() => {
    setCuota(null)
    setLosCobros([])
    cargar()
  }, [cargar])

  const volver = (
    <Button asChild variant="outline">
      <Link to="/cuotas">
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  if (!cuota) {
    return (
      <div className="space-y-3">
        <TituloPantalla icono={CalendarClock} acciones={volver}>
          Cuota
        </TituloPantalla>
        <AvisoDeError mensaje={error} />
        {!error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    )
  }

  const pendiente = cuota.estado === 'pendiente'
  const moneda = cuota.moneda
  const conPagos = conPagosACuenta(cuota)
  // El cobro que enlaza una cobrada: el último vivo que dice la cuota (`cobro_id`) y, si no vino en la lista, el más nuevo de ella.
  const cobro = losCobros.find((x) => x.id === cuota.cobro_id) ?? losCobros.at(-1) ?? null
  // Los pagos se listan en una pendiente con pagos a cuenta y en una cobrada que se cobró en partes; con un solo cobro basta el enlace.
  const conVariosPagos = cuota.cobros.length > 0 && (pendiente || cuota.cobros.length > 1)

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={CalendarClock}
        acciones={
          <>
            {pendiente && (
              <>
                <Button asChild>
                  <Link to={`/cuotas/${cuota.id}/cobrar`}>
                    <HandCoins className="size-4" />
                    Cobrar
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setAnulando(true)}>
                  <XCircle className="size-4" />
                  Anular
                </Button>
              </>
            )}
            {volver}
          </>
        }
      >
        Cuota de {nombreDelMes(cuota.periodo_desde)}
      </TituloPantalla>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {cuota.numero_contrato} · {cuota.inquilino_nombre}
        <EstadoDeCuotaConSaldo cuota={cuota} />
      </p>

      <AvisoDeError mensaje={error} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la cuota</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Contrato">
              <Link to={`/contratos/${cuota.contrato_id}`} className="underline underline-offset-4">
                {cuota.numero_contrato}
              </Link>
            </Dato>
            <Dato etiqueta="Inquilino">{cuota.inquilino_nombre}</Dato>
            <Dato etiqueta="Período">
              {fecha(cuota.periodo_desde)} al {fecha(cuota.periodo_hasta)}
            </Dato>
            <Dato etiqueta="Prorrateo">
              {cuota.prorrateada ? `${cuota.dias_cubiertos} de ${cuota.dias_del_periodo} días` : 'Mes entero'}
            </Dato>
            <Dato etiqueta="Emitida">{fecha(cuota.fecha_emision)}</Dato>
            <Dato etiqueta="Vence">{fecha(cuota.fecha_vencimiento)}</Dato>
            <Dato etiqueta="Estado">
              <EstadoDeCuotaConSaldo cuota={cuota} />
            </Dato>
            {conPagos && <Dato etiqueta="Pagado a cuenta">{pesos(cuota.pagado, moneda)}</Dato>}
            {cuota.estado === 'cobrada' && (
              <Dato etiqueta="Cobro">
                {cobro ? (
                  <Link to={`/cobros/${cobro.id}`} className="underline underline-offset-4">
                    Cobrada el {fecha(cobro.fecha)}: ver el cobro
                  </Link>
                ) : (
                  'Cobrada'
                )}
              </Dato>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Qué incluye</CardTitle>
          {pendiente && (
            <Button variant="outline" size="sm" onClick={() => setCargando(true)}>
              <Plus className="size-4" />
              Cargar un cargo
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuota.lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.descripcion}</TableCell>
                  <TableCell className="text-right">{pesos(l.importe, moneda)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right font-semibold">{pesos(cuota.total, moneda)}</TableCell>
              </TableRow>
              {conPagos && (
                <>
                  <TableRow>
                    <TableCell className="font-medium">Pagado a cuenta</TableCell>
                    <TableCell className="text-right">{pesos(cuota.pagado, moneda)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Saldo</TableCell>
                    <TableCell className="text-right font-semibold">{pesos(cuota.saldo, moneda)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {conVariosPagos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagos recibidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Cada pago a cuenta va primero al punitorio adeudado y el resto a la cuota. Para anular uno, se anula primero el más nuevo.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cobro</TableHead>
                  <TableHead className="text-right">Aplicado a la cuota</TableHead>
                  <TableHead className="text-right">Total cobrado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuota.cobros.map((cid) => {
                  const c = losCobros.find((x) => x.id === cid)
                  return (
                    <TableRow key={cid}>
                      <TableCell>
                        <Link to={`/cobros/${cid}`} className="underline underline-offset-4">
                          {c ? `Cobro del ${fecha(c.fecha)}` : `Cobro ${cid}`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{c ? pesos(c.importe_cuota, moneda) : ''}</TableCell>
                      <TableCell className="text-right">{c ? pesos(c.total, moneda) : ''}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {cuota.gastos_del_propietario.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gastos del propietario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Lo que paga el propietario por esta cuota se cargó solo como gasto por su cuenta y se descuenta en su liquidación. No se anula
              suelto: se anula junto con la cuota.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuota.gastos_del_propietario.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <span className={g.anulado ? 'text-muted-foreground line-through' : undefined}>{g.descripcion}</span>
                      {g.anulado && (
                        <span className="ml-2">
                          <Anulado />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${g.anulado ? 'text-muted-foreground line-through' : ''}`}>{pesos(g.importe, moneda)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {cargando && (
        <DialogoDeCargo
          abierto
          cuota={cuota}
          conceptos={conceptos}
          moneda={moneda}
          onCerrar={() => setCargando(false)}
          onCambio={(q) => {
            setCargando(false)
            setCuota(q)
          }}
        />
      )}
      <DialogoDeMotivo
        abierto={anulando}
        titulo={`Anular la cuota de ${nombreDelMes(cuota.periodo_desde)}`}
        descripcion={`Se contraasienta el cargo de la cuenta del inquilino y el mes se puede volver a generar. Sólo se anula una cuota pendiente${conPagos ? ' y, como ya tiene pagos a cuenta, antes hay que anularlos, empezando por el más nuevo' : ''}.`}
        confirmar="Anular cuota"
        onCerrar={() => setAnulando(false)}
        onConfirmar={async (motivo) => {
          setCuota(await cuotas.anular(cuota.id, motivo))
          setAnulando(false)
        }}
      />
    </div>
  )
}
