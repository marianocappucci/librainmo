/**
 * La ficha de una liquidación: sus movimientos, los totales y lo que se puede hacer según su estado (ADR-007).
 *
 * Emitida: «Registrar el pago» (transferencia, efectivo o cheque: un cargo por el neto en la cuenta del propietario, que queda en cero
 * por lo liquidado) y «Anular» con motivo (contraasienta la comisión y libera los movimientos para otra liquidación). Pagada o anulada:
 * sólo se mira. El PDF se abre en otra pestaña.
 *
 * 🔑 **Con saldo deudor** (neto negativo, ADR-011) la liquidación no se paga —no hay a quién pagarle—: la ficha lo explica y sólo ofrece
 * «Anular». La próxima liquidación del propietario en esa moneda descuenta el saldo como un ítem y deja a esta **saldada**, con un enlace a la
 * que la saldó; una saldada ya no se anula suelta (primero hay que anular la que la saldó, y entonces vuelve a quedar con saldo deudor).
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, FileSpreadsheet, HandCoins, XCircle } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { CampoCerrado, CampoDeTexto } from '@/components/campos'
import { Dato } from '@/components/Dato'
import { DialogoDeFormulario } from '@/components/DialogoDeFormulario'
import { DialogoDeMotivo } from '@/components/DialogoDeMotivo'
import { EstadoDeLiquidacion } from '@/components/Estados'
import { ItemsDeLiquidacion, TotalesDeLiquidacionVista } from '@/components/ItemsDeLiquidacion'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { liquidaciones, mensajeDeError, urlDelPdfDeLiquidacion } from '@/lib/api'
import type { Liquidacion } from '@/lib/api'
import { MEDIOS_DE_PAGO_AL_PROPIETARIO, MONEDAS, etiquetaDe, nombreDeMoneda } from '@/lib/dominio'
import { fecha as verFecha, hoyISO } from '@/lib/fechas'
import { pesos } from '@/lib/importes'

const esquemaDePago = z.object({
  fecha: z.string().min(1, 'La fecha del pago es obligatoria.'),
  medio_pago: z.string().min(1, 'Elegí el medio.'),
  referencia: z.string().trim().max(120, 'Hasta 120 caracteres.'),
})

type ValoresDePago = z.infer<typeof esquemaDePago>

function DialogoDePago({ abierto, liquidacion, onCerrar, onCambio }: {
  abierto: boolean
  liquidacion: Liquidacion
  onCerrar: () => void
  onCambio: (l: Liquidacion) => void
}) {
  const form = useForm<ValoresDePago>({ resolver: zodResolver(esquemaDePago), defaultValues: { fecha: '', medio_pago: 'transferencia', referencia: '' } })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    form.reset({ fecha: hoyISO(), medio_pago: 'transferencia', referencia: '' })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  async function enviar(v: ValoresDePago) {
    setError(null)
    try {
      onCambio(await liquidaciones.pagar(liquidacion.id, { fecha: v.fecha, medio_pago: v.medio_pago, referencia: v.referencia.trim() || null }))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <DialogoDeFormulario
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Registrar el pago de ${liquidacion.numero}`}
      descripcion={`Se le paga a ${liquidacion.propietario_nombre} el neto de ${pesos(liquidacion.neto, liquidacion.moneda)}. La fecha no puede ser anterior a la de la liquidación (${verFecha(liquidacion.fecha)}).`}
      form={form}
      onEnviar={enviar}
      error={error}
      enviar="Registrar el pago"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoDeTexto control={form.control} name="fecha" etiqueta="Fecha del pago" type="date" min={liquidacion.fecha} />
        <CampoCerrado control={form.control} name="medio_pago" etiqueta="Medio de pago" opciones={MEDIOS_DE_PAGO_AL_PROPIETARIO} />
      </div>
      <CampoDeTexto control={form.control} name="referencia" etiqueta="Referencia" placeholder="Opcional: N° de transferencia o de cheque" autoComplete="off" />
    </DialogoDeFormulario>
  )
}

export function LiquidacionDetalle() {
  const { id } = useParams()
  const [liq, setLiq] = useState<Liquidacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pagando, setPagando] = useState(false)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    setLiq(null)
    liquidaciones
      .obtener(Number(id))
      .then((l) => {
        setLiq(l)
        setError(null)
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [id])

  const volver = (
    <Button asChild variant="outline">
      <Link to="/liquidaciones">
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  if (!liq) {
    return (
      <div className="space-y-3">
        <TituloPantalla icono={FileSpreadsheet} acciones={volver}>
          Liquidación
        </TituloPantalla>
        <AvisoDeError mensaje={error} />
        {!error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    )
  }

  const emitida = liq.estado === 'emitida'
  const deudora = liq.estado === 'deudora'
  const descontoUnSaldo = liq.items.some((i) => i.tipo === 'saldo')

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FileSpreadsheet}
        acciones={
          <>
            <Button asChild variant="outline">
              <a href={urlDelPdfDeLiquidacion(liq.id)} target="_blank" rel="noopener noreferrer">
                <FileDown className="size-4" />
                Abrir el PDF
              </a>
            </Button>
            {emitida && (
              <Button onClick={() => setPagando(true)}>
                <HandCoins className="size-4" />
                Registrar el pago
              </Button>
            )}
            {(emitida || deudora) && (
              <Button variant="outline" onClick={() => setAnulando(true)}>
                <XCircle className="size-4" />
                Anular
              </Button>
            )}
            {volver}
          </>
        }
      >
        {liq.numero}
      </TituloPantalla>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {liq.propietario_nombre}
        <EstadoDeLiquidacion estado={liq.estado} />
      </p>

      <AvisoDeError mensaje={error} />
      {deudora && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Los gastos y la comisión superaron lo cobrado (neto de {pesos(liq.neto, liq.moneda)}): el propietario le debe ese saldo a la
          inmobiliaria. Esta liquidación no se paga: el saldo se descuenta en la próxima liquidación de {liq.propietario_nombre} en{' '}
          {nombreDeMoneda(liq.moneda)}.
        </p>
      )}
      {liq.estado === 'saldada' && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Su saldo deudor ya se descontó
          {liq.saldada_por ? (
            <>
              {' '}en la liquidación{' '}
              <Link to={`/liquidaciones/${liq.saldada_por.id}`} className="underline underline-offset-4">
                {liq.saldada_por.numero}
              </Link>
            </>
          ) : (
            ' en otra liquidación'
          )}
          . Para anularla, primero hay que anular esa.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la liquidación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Propietario">{liq.propietario_nombre}</Dato>
            <Dato etiqueta="Fecha">{verFecha(liq.fecha)}</Dato>
            <Dato etiqueta="Moneda">{etiquetaDe(MONEDAS, liq.moneda)}</Dato>
            <Dato etiqueta="Liquidado hasta">{verFecha(liq.hasta)}</Dato>
            <Dato etiqueta="Emitida por">{liq.usuario}</Dato>
            {liq.estado === 'saldada' && (
              <Dato etiqueta="Saldada por">
                {liq.saldada_por ? (
                  <Link to={`/liquidaciones/${liq.saldada_por.id}`} className="underline underline-offset-4">
                    {liq.saldada_por.numero}
                  </Link>
                ) : (
                  ''
                )}
              </Dato>
            )}
            {liq.estado === 'pagada' && (
              <>
                <Dato etiqueta="Pagada el">{verFecha(liq.fecha_pago)}</Dato>
                <Dato etiqueta="Medio de pago">{etiquetaDe(MEDIOS_DE_PAGO_AL_PROPIETARIO, liq.medio_pago)}</Dato>
                <Dato etiqueta="Referencia del pago">{liq.referencia_pago}</Dato>
              </>
            )}
            <Dato etiqueta="Observaciones" className="sm:col-span-2 lg:col-span-4">
              <span className="whitespace-pre-line">{liq.observaciones}</span>
            </Dato>
          </dl>
          <TotalesDeLiquidacionVista totales={liq} moneda={liq.moneda} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimientos liquidados</CardTitle>
        </CardHeader>
        <CardContent>
          {liq.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {liq.estado === 'anulada' ? 'Al anularla, sus movimientos quedaron libres para otra liquidación.' : 'Sin movimientos.'}
            </p>
          ) : (
            <ItemsDeLiquidacion items={liq.items} moneda={liq.moneda} />
          )}
        </CardContent>
      </Card>

      <DialogoDePago
        abierto={pagando}
        liquidacion={liq}
        onCerrar={() => setPagando(false)}
        onCambio={(l) => {
          setPagando(false)
          setLiq(l)
        }}
      />
      <DialogoDeMotivo
        abierto={anulando}
        titulo={`Anular la liquidación ${liq.numero}`}
        descripcion={`Se contraasienta la comisión y los movimientos quedan libres para otra liquidación. Sólo se anula una emitida o con saldo deudor, y que no esté pagada ni saldada.${descontoUnSaldo ? ' Esta liquidación descontó el saldo deudor de otra: al anularla, esa vuelve a quedar con saldo deudor.' : ''}`}
        confirmar="Anular liquidación"
        onCerrar={() => setAnulando(false)}
        onConfirmar={async (motivo) => {
          setLiq(await liquidaciones.anular(liq.id, motivo))
          setAnulando(false)
        }}
      />
    </div>
  )
}
