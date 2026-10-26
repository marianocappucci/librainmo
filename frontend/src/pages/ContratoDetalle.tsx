/**
 * La ficha de un contrato: sus datos, el historial de precios, las garantías y los conceptos, y las acciones que su estado permite.
 *
 * 🔑 **Las acciones siguen el ciclo** `borrador → vigente → rescindido | finalizado` (ADR-004, punto 4):
 *   - borrador: activar, editar (entero) y borrar;
 *   - vigente: rescindir, finalizar y editar sólo las observaciones; el alquiler se actualiza con vigencia;
 *   - rescindido o finalizado: sólo se mira.
 * Las que cierran algo (activar, finalizar, borrar, rescindir) piden confirmación. Si el servidor las rechaza (409: «la propiedad no tiene
 * sus titulares completos», «el contrato termina el…»), el motivo se muestra arriba, tal cual lo dice.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CirclePlay, FilePenLine, Pencil, Trash2 } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { ConceptosDelContrato } from '@/components/ConceptosDelContrato'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dato } from '@/components/Dato'
import { DialogoDeObservaciones, DialogoDePrecio, DialogoDeRescision } from '@/components/DialogosDelContrato'
import { EstadoDeContrato } from '@/components/Estados'
import { GarantiasDelContrato } from '@/components/GarantiasDelContrato'
import { AvisoDeError } from '@/components/listado'
import { PreciosDelContrato } from '@/components/PreciosDelContrato'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { contratos, mensajeDeError } from '@/lib/api'
import type { ContratoDetalle as ContratoCompleto } from '@/lib/api'
import {
  BASES_DE_PUNITORIO, DESTINOS_DE_PUNITORIO, ESTADOS_CERRADOS_DE_CONTRATO, METODOS_DE_AJUSTE, METODO_FIJO, METODO_INDICE, METODO_PORCENTAJE,
  MONEDAS, PERIODICIDADES, etiquetaDe,
} from '@/lib/dominio'
import { fecha } from '@/lib/fechas'
import { pesos, porcentaje } from '@/lib/importes'

type Dialogo = 'precio' | 'rescindir' | 'observaciones'
type Confirmacion = 'activar' | 'finalizar' | 'borrar'

export function ContratoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [contrato, setContrato] = useState<ContratoCompleto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)

  useEffect(() => {
    setContrato(null)
    contratos
      .obtener(Number(id))
      .then((c) => {
        setContrato(c)
        setError(null)
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [id])

  /** Un cambio que sale bien deja el contrato como lo devuelve la API y limpia el error de un intento anterior. */
  function alCambiar(c: ContratoCompleto) {
    setContrato(c)
    setDialogo(null)
    setError(null)
  }

  async function ejecutar(accion: Confirmacion, c: ContratoCompleto) {
    setError(null)
    try {
      if (accion === 'borrar') {
        await contratos.borrar(c.id)
        navigate('/contratos')
        return
      }
      alCambiar(await (accion === 'activar' ? contratos.activar(c.id) : contratos.finalizar(c.id)))
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const volver = (
    <Button asChild variant="outline">
      <Link to="/contratos">
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  if (!contrato) {
    return (
      <div className="space-y-3">
        <TituloPantalla icono={FilePenLine} acciones={volver}>
          Contrato
        </TituloPantalla>
        <AvisoDeError mensaje={error} />
        {!error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    )
  }

  const borrador = contrato.estado === 'borrador'
  const vigente = contrato.estado === 'vigente'
  const cerrado = ESTADOS_CERRADOS_DE_CONTRATO.includes(contrato.estado)
  const fijo = contrato.metodo_ajuste === METODO_FIJO

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FilePenLine}
        acciones={
          <>
            {borrador && (
              <>
                <Button onClick={() => setConfirmacion('activar')}>
                  <CirclePlay className="size-4" />
                  Activar
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/contratos/${contrato.id}/editar`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setConfirmacion('borrar')}>
                  <Trash2 className="size-4" />
                  Borrar
                </Button>
              </>
            )}
            {vigente && (
              <>
                <Button variant="outline" onClick={() => setDialogo('rescindir')}>
                  Rescindir
                </Button>
                <Button variant="outline" onClick={() => setConfirmacion('finalizar')}>
                  Finalizar
                </Button>
              </>
            )}
            {volver}
          </>
        }
      >
        {contrato.numero}
      </TituloPantalla>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {contrato.propiedad_direccion} · {contrato.inquilino_nombre}
        <EstadoDeContrato estado={contrato.estado} />
      </p>

      <AvisoDeError mensaje={error} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Datos del contrato</CardTitle>
          {vigente && (
            <Button variant="outline" size="sm" onClick={() => setDialogo('observaciones')}>
              <Pencil className="size-4" />
              Editar observaciones
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Propiedad">
              <Link to={`/propiedades/${contrato.propiedad_id}`} className="underline underline-offset-4">
                {contrato.propiedad_codigo}
              </Link>{' '}
              · {contrato.propiedad_direccion}
            </Dato>
            <Dato etiqueta="Inquilino">{contrato.inquilino_nombre}</Dato>
            <Dato etiqueta="Inicio">{fecha(contrato.fecha_inicio)}</Dato>
            <Dato etiqueta="Fin">{fecha(contrato.fecha_fin)}</Dato>
            {contrato.fecha_rescision && <Dato etiqueta="Rescindido el">{fecha(contrato.fecha_rescision)}</Dato>}
            <Dato etiqueta="Alquiler vigente">
              {pesos(contrato.importe_vigente, contrato.moneda)}
              {contrato.precio_vigente_desde && (
                <span className="text-muted-foreground"> desde el {fecha(contrato.precio_vigente_desde)}</span>
              )}
            </Dato>
            <Dato etiqueta="Moneda">{etiquetaDe(MONEDAS, contrato.moneda)}</Dato>
            <Dato etiqueta="Vence el día">{String(contrato.dia_vencimiento)}</Dato>
            <Dato etiqueta="Días de gracia">{String(contrato.dias_gracia)}</Dato>
            <Dato etiqueta="Ajuste">{etiquetaDe(METODOS_DE_AJUSTE, contrato.metodo_ajuste)}</Dato>
            {contrato.metodo_ajuste === METODO_INDICE && (
              <Dato etiqueta="Índice">{contrato.indice_ajuste_nombre ?? contrato.indice_ajuste}</Dato>
            )}
            {contrato.metodo_ajuste === METODO_PORCENTAJE && (
              <Dato etiqueta="Porcentaje de cada ajuste">{porcentaje(contrato.porcentaje_ajuste, 2)}</Dato>
            )}
            {!fijo && <Dato etiqueta="Se ajusta">{etiquetaDe(PERIODICIDADES, contrato.periodicidad_ajuste)}</Dato>}
            <Dato etiqueta="Punitorio">
              {contrato.punitorio_tasa
                ? `${porcentaje(contrato.punitorio_tasa, 2)} ${etiquetaDe(BASES_DE_PUNITORIO, contrato.punitorio_base).toLowerCase()}, para ${etiquetaDe(DESTINOS_DE_PUNITORIO, contrato.punitorio_para).toLowerCase()}`
                : 'Sin punitorio pactado'}
            </Dato>
            <Dato etiqueta="Comisión">{porcentaje(contrato.comision_pct, 2)}</Dato>
            <Dato etiqueta="Depósito">{pesos(contrato.deposito, contrato.moneda)}</Dato>
            <Dato etiqueta="Observaciones" className="sm:col-span-2 lg:col-span-4">{contrato.observaciones}</Dato>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Precio del alquiler</CardTitle>
        </CardHeader>
        <CardContent>
          <PreciosDelContrato
            precios={contrato.precios}
            moneda={contrato.moneda}
            puedeActualizar={vigente}
            onActualizar={() => setDialogo('precio')}
          />
          {borrador && (
            <p className="mt-3 text-sm text-muted-foreground">
              El precio inicial de un borrador se cambia editando el contrato. El historial con vigencias empieza al activarlo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Garantías</CardTitle>
        </CardHeader>
        <CardContent>
          <GarantiasDelContrato contrato={contrato} puedeCambiar={!cerrado} onCambio={alCambiar} onError={setError} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conceptos trasladables</CardTitle>
        </CardHeader>
        <CardContent>
          <ConceptosDelContrato contrato={contrato} puedeCambiar={!cerrado} onCambio={alCambiar} onError={setError} />
        </CardContent>
      </Card>

      <DialogoDePrecio abierto={dialogo === 'precio'} contrato={contrato} onCerrar={() => setDialogo(null)} onCambio={alCambiar} />
      <DialogoDeRescision abierto={dialogo === 'rescindir'} contrato={contrato} onCerrar={() => setDialogo(null)} onCambio={alCambiar} />
      <DialogoDeObservaciones abierto={dialogo === 'observaciones'} contrato={contrato} onCerrar={() => setDialogo(null)} onCambio={alCambiar} />

      <ConfirmDialog
        open={confirmacion === 'activar'}
        onOpenChange={(o) => { if (!o) setConfirmacion(null) }}
        title={`¿Activar el contrato ${contrato.numero}?`}
        description="La propiedad pasa a «alquilada». Hace falta que sus titulares sumen 100 % y que no tenga otro contrato vigente."
        confirmLabel="Activar contrato"
        onConfirm={() => {
          setConfirmacion(null)
          void ejecutar('activar', contrato)
        }}
      />
      <ConfirmDialog
        open={confirmacion === 'finalizar'}
        onOpenChange={(o) => { if (!o) setConfirmacion(null) }}
        title={`¿Finalizar el contrato ${contrato.numero}?`}
        description={`Cierra el contrato al cumplirse su plazo (${fecha(contrato.fecha_fin)}) y la propiedad vuelve a «disponible». Antes de esa fecha no se puede finalizar: se rescinde.`}
        confirmLabel="Finalizar contrato"
        onConfirm={() => {
          setConfirmacion(null)
          void ejecutar('finalizar', contrato)
        }}
      />
      <ConfirmDialog
        open={confirmacion === 'borrar'}
        onOpenChange={(o) => { if (!o) setConfirmacion(null) }}
        title={`¿Borrar el borrador ${contrato.numero}?`}
        description="Se borra con su precio, garantías y conceptos. Sólo se borra un borrador: uno que estuvo vigente queda en el historial."
        confirmLabel="Borrar borrador"
        onConfirm={() => {
          setConfirmacion(null)
          void ejecutar('borrar', contrato)
        }}
      />
    </div>
  )
}
