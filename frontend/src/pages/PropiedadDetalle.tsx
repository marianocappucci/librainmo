/**
 * La ficha de una propiedad: sus datos (con edición), sus titulares (con su editor) y el contrato vigente.
 *
 * Lo que la ficha tiene que dejar claro es quién es el dueño y si el reparto está completo: sin titulares que sumen 100 % el contrato no
 * se puede activar (el servidor lo rechaza), y la liquidación no sabría a quién pagarle.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, FilePlus, Pencil } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { Dato } from '@/components/Dato'
import { EditorDeTitulares } from '@/components/EditorDeTitulares'
import { EstadoDePropiedad } from '@/components/Estados'
import { FormularioDePropiedad } from '@/components/FormularioDePropiedad'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { mensajeDeError, propiedades } from '@/lib/api'
import type { Propiedad } from '@/lib/api'
import { ESTADOS_SIN_CONTRATO, TIPOS_DE_PROPIEDAD, direccionCompleta, etiquetaDe } from '@/lib/dominio'

export function PropiedadDetalle() {
  const { id } = useParams()
  const [propiedad, setPropiedad] = useState<Propiedad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)

  const cargar = useCallback(() => {
    propiedades
      .obtener(Number(id))
      .then((p) => {
        setPropiedad(p)
        setError(null)
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [id])

  useEffect(() => {
    setPropiedad(null)
    cargar()
  }, [cargar])

  const volver = (
    <Button asChild variant="outline">
      <Link to="/propiedades">
        <ArrowLeft className="size-4" />
        Volver
      </Link>
    </Button>
  )

  if (!propiedad) {
    return (
      <div className="space-y-3">
        <TituloPantalla icono={Building2} acciones={volver}>
          Propiedad
        </TituloPantalla>
        <AvisoDeError mensaje={error} />
        {!error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      </div>
    )
  }

  const vigente = propiedad.contrato_vigente
  const admiteContrato = !ESTADOS_SIN_CONTRATO.includes(propiedad.estado)

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={Building2}
        acciones={
          <>
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-4" />
              Editar
            </Button>
            {volver}
          </>
        }
      >
        {propiedad.codigo}
      </TituloPantalla>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {direccionCompleta(propiedad)}
        <EstadoDePropiedad estado={propiedad.estado} />
      </p>

      <AvisoDeError mensaje={error} />

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos de la propiedad</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Dato etiqueta="Tipo">{etiquetaDe(TIPOS_DE_PROPIEDAD, propiedad.tipo)}</Dato>
              <Dato etiqueta="Estado">
                <EstadoDePropiedad estado={propiedad.estado} />
              </Dato>
              <Dato etiqueta="Dirección" className="sm:col-span-2">{propiedad.direccion}</Dato>
              <Dato etiqueta="Unidad">{propiedad.unidad}</Dato>
              <Dato etiqueta="Localidad">{propiedad.localidad}</Dato>
              <Dato etiqueta="Partida ABL">{propiedad.partida_abl}</Dato>
              <Dato etiqueta="Partida ARBA">{propiedad.partida_arba}</Dato>
              <Dato etiqueta="Observaciones" className="sm:col-span-2">{propiedad.observaciones}</Dato>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contrato vigente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {vigente ? (
              <p className="text-sm">
                <Link to={`/contratos/${vigente.id}`} className="font-medium underline underline-offset-4">
                  {vigente.numero}
                </Link>
                <span className="text-muted-foreground"> · ver el contrato</span>
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">No tiene un contrato vigente.</p>
                {admiteContrato && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/contratos/nuevo?propiedad=${propiedad.id}`}>
                      <FilePlus className="size-4" />
                      Nuevo contrato
                    </Link>
                  </Button>
                )}
              </>
            )}
            {!propiedad.titulares_completos && (
              <p className="text-sm text-muted-foreground">
                Los titulares no suman 100 %: hasta completarlos el contrato no se puede activar.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Titulares</CardTitle>
        </CardHeader>
        <CardContent>
          <EditorDeTitulares propiedad={propiedad} onGuardado={setPropiedad} />
        </CardContent>
      </Card>

      <FormularioDePropiedad
        abierto={editando}
        propiedad={propiedad}
        onCerrar={() => setEditando(false)}
        onGuardado={(p) => {
          setEditando(false)
          setPropiedad(p)
        }}
      />
    </div>
  )
}
