/**
 * La ficha de un cobro: lo que pagó el inquilino, con qué, el recibo y a quién le tocó cada parte (ADR-006).
 *
 * 🔑 **La imputación por propietario** es lo que después entra en su liquidación: el alquiler (base de la comisión), los conceptos y,
 * si el contrato lo dice, el punitorio, repartidos por el porcentaje de cada titular. La ficha los agrupa por propietario con su
 * subtotal.
 *
 * 🔑 **Pago a cuenta** (ADR-010): si la cuota quedó con saldo, la ficha lo marca («Pago a cuenta»). `Importe de la cuota` pasa a ser lo que este
 * pago aplicó a la cuota (`Aplicado a la cuota`; puede ser cero si sólo alcanzó al punitorio) y, si el pago no cubrió todo el punitorio adeudado,
 * se muestra el `Punitorio pendiente`, que se arrastra al próximo cobro. Lo que falta de la cuota se ve en su ficha.
 *
 * Anular contraasienta todo, anula el recibo y deja la cuota otra vez pendiente. Si el cobro ya está en una liquidación, el servidor lo
 * rechaza (409) y el motivo se ve en el diálogo: primero hay que anular la liquidación.
 *
 * 🔸 El recibo se anula **después** de confirmar el cobro anulado (`anular_recibo` del motor todavía no acepta `conn=`, ADR-006): si
 * falla, el cobro queda anulado y el recibo vigente. La ficha lo avisa cuando pasa, porque el recibo no se ve en ningún otro lado.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, XCircle } from 'lucide-react'
import { ICONOS } from 'libra-ui/iconos-identidad'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'
import { BadgeEstado } from 'libra-ui/badge-estado'

import { Dato } from '@/components/Dato'
import { DialogoDeMotivo } from '@/components/DialogoDeMotivo'
import { Anulado } from '@/components/Estados'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cobros, mensajeDeError, urlDelRecibo } from '@/lib/api'
import type { Cobro, ImputacionDeCobro } from '@/lib/api'
import { MEDIOS_DE_COBRO, TIPOS_DE_IMPUTACION, esPagoACuenta, etiquetaDe } from '@/lib/dominio'
import { fecha, nombreDelMes } from '@/lib/fechas'
import { aCentesimas, deCentesimas, pesos, sumarEnCentavos } from '@/lib/importes'

/** Las imputaciones agrupadas por propietario, con su subtotal en centavos (sin `float`). */
function porPropietario(imputaciones: ImputacionDeCobro[]) {
  const grupos = new Map<number, { nombre: string; partes: ImputacionDeCobro[] }>()
  for (const i of imputaciones) {
    const g = grupos.get(i.propietario_id) ?? { nombre: i.propietario_nombre ?? `Cliente ${i.propietario_id}`, partes: [] }
    g.partes.push(i)
    grupos.set(i.propietario_id, g)
  }
  return [...grupos.entries()].map(([id, g]) => ({
    id,
    nombre: g.nombre,
    partes: g.partes,
    subtotal: deCentesimas(sumarEnCentavos(g.partes.map((p) => p.importe)) ?? 0),
  }))
}

export function CobroDetalle() {
  const { id } = useParams()
  const [cobro, setCobro] = useState<Cobro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    setCobro(null)
    cobros
      .obtener(Number(id))
      .then((c) => {
        setCobro(c)
        setError(null)
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [id])

  const volver = (
    <Button asChild variant="outline">
      <Link to="/cobros">
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  if (!cobro) {
    return (
      <div className="space-y-3">
        <TituloPantalla icono={ICONOS.recibos} acciones={volver}>
          Cobro
        </TituloPantalla>
        <AvisoDeError mensaje={error} />
        {!error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    )
  }

  const grupos = porPropietario(cobro.imputaciones)
  const reciboSinAnular = cobro.anulado && cobro.recibo !== null && !cobro.recibo.anulado
  const aCuenta = esPagoACuenta(cobro)
  const conPunitorioPendiente = aCentesimas(cobro.punitorio_pendiente) !== 0

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={ICONOS.recibos}
        acciones={
          <>
            {cobro.recibo && (
              <Button asChild variant="outline">
                <a href={urlDelRecibo(cobro.id)} target="_blank" rel="noopener noreferrer">
                  <FileDown className="size-4" />
                  Abrir el recibo (PDF)
                </a>
              </Button>
            )}
            {!cobro.anulado && (
              <Button variant="outline" onClick={() => setAnulando(true)}>
                <XCircle className="size-4" />
                Anular
              </Button>
            )}
            {volver}
          </>
        }
      >
        Cobro del {fecha(cobro.fecha)}
      </TituloPantalla>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {cobro.numero_contrato} · {cobro.inquilino_nombre}
        {cobro.anulado ? <Anulado /> : <BadgeEstado tono="ok">Cobrado</BadgeEstado>}
        {aCuenta && <BadgeEstado tono="atencion">Pago a cuenta</BadgeEstado>}
      </p>

      <AvisoDeError mensaje={error} />
      {cobro.anulado && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Anulado: {cobro.motivo_anulacion}
        </p>
      )}
      {reciboSinAnular && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          El cobro está anulado pero su recibo todavía figura vigente: no se pudo anularlo junto con el cobro. Avisá a soporte para
          anularlo.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del cobro</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Contrato">
              <Link to={`/contratos/${cobro.contrato_id}`} className="underline underline-offset-4">
                {cobro.numero_contrato}
              </Link>
            </Dato>
            <Dato etiqueta="Cuota">
              <Link to={`/cuotas/${cobro.cuota_id}`} className="underline underline-offset-4">
                {nombreDelMes(cobro.periodo_desde)}
              </Link>
            </Dato>
            <Dato etiqueta="Inquilino">{cobro.inquilino_nombre}</Dato>
            <Dato etiqueta="Cargado por">{cobro.usuario}</Dato>
            <Dato etiqueta={aCuenta ? 'Aplicado a la cuota' : 'Importe de la cuota'}>{pesos(cobro.importe_cuota, cobro.moneda)}</Dato>
            <Dato etiqueta="Punitorio">
              {pesos(cobro.punitorio, cobro.moneda)}
              {cobro.dias_de_atraso > 0 && (
                <span className="text-muted-foreground"> · {cobro.dias_de_atraso} {cobro.dias_de_atraso === 1 ? 'día' : 'días'} de atraso</span>
              )}
            </Dato>
            <Dato etiqueta="Punitorio condonado">{aCentesimas(cobro.punitorio_condonado) === 0 ? '' : pesos(cobro.punitorio_condonado, cobro.moneda)}</Dato>
            {conPunitorioPendiente && (
              <Dato etiqueta="Punitorio pendiente">
                {pesos(cobro.punitorio_pendiente, cobro.moneda)}
                <div className="text-xs text-muted-foreground">Este pago no lo cubrió: se arrastra al próximo cobro.</div>
              </Dato>
            )}
            <Dato etiqueta="Total cobrado">
              <strong>{pesos(cobro.total, cobro.moneda)}</strong>
            </Dato>
            <Dato etiqueta="Recibo" className="sm:col-span-2">
              {cobro.recibo ? (
                <>
                  N° {cobro.recibo.numero}
                  {cobro.recibo.punto_venta ? ` · punto de venta ${cobro.recibo.punto_venta}` : ''}
                  {cobro.recibo.anulado && <span className="text-muted-foreground"> · anulado</span>}
                  <div className="text-muted-foreground">{cobro.recibo.concepto}</div>
                </>
              ) : (
                ''
              )}
            </Dato>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Con qué pagó</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medio</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cobro.medios.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{etiquetaDe(MEDIOS_DE_COBRO, m.medio_pago)}</TableCell>
                  <TableCell>{m.referencia || '—'}</TableCell>
                  <TableCell className="text-right">{pesos(m.monto, cobro.moneda)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A quién le tocó</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La inmobiliaria cobra por cuenta de los propietarios: cada parte va a su cuenta y entra en su próxima liquidación.
          </p>
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin imputaciones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Propietario</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              {grupos.map((g) => (
                <TableBody key={g.id}>
                  {g.partes.map((p, i) => (
                    <TableRow key={`${p.tipo}-${i}`}>
                      <TableCell className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{i === 0 ? g.nombre : ''}</TableCell>
                      <TableCell>{etiquetaDe(TIPOS_DE_IMPUTACION, p.tipo)}</TableCell>
                      <TableCell className="text-right">{pesos(p.importe, cobro.moneda)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={2} className="text-right text-muted-foreground">
                      Total de {g.nombre}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{pesos(g.subtotal, cobro.moneda)}</TableCell>
                  </TableRow>
                </TableBody>
              ))}
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-right">Total imputado a propietarios</TableCell>
                  <TableCell className="text-right font-semibold">
                    {pesos(deCentesimas(sumarEnCentavos(cobro.imputaciones.map((i) => i.importe)) ?? 0), cobro.moneda)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <DialogoDeMotivo
        abierto={anulando}
        titulo="Anular el cobro"
        descripcion="Se contraasienta todo —la cuenta del inquilino y la de cada propietario—, se anula el recibo y la cuota vuelve a quedar pendiente. Si el cobro ya está en una liquidación, primero hay que anular la liquidación."
        confirmar="Anular cobro"
        onCerrar={() => setAnulando(false)}
        onConfirmar={async (motivo) => {
          setCobro(await cobros.anular(cobro.id, motivo))
          setAnulando(false)
        }}
      />
    </div>
  )
}

