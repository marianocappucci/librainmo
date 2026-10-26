/**
 * El ajuste del alquiler en la ficha de un contrato vigente que se ajusta por porcentaje o por índice (ADR-005, puntos 4 y 5).
 *
 * Muestra **la propuesta** (`GET /api/contratos/{id}/ajuste`, que no escribe nada) y deja aplicarla con confirmación (`POST`). La cuenta
 * —los valores del índice, el coeficiente, bajarlos de la fuente si faltan— es del motor y no se rehace acá: la pantalla dibuja lo que
 * contestó el backend.
 *
 * Cuatro respuestas distintas, y se dibujan distinto:
 *   1. la propuesta (`corresponde: true`), con el importe nuevo, la variación y, por índice, los valores que tomó;
 *   2. «todavía no toca» (`corresponde: false`): el primer período sin cumplir, o el período en curso ya ajustado;
 *   3. el 409 de «falta un valor del índice» (`detail` es un objeto con `fechas_faltantes`): no es un error de quien mira, y dice qué
 *      fechas faltan y si el índice se baja solo o se carga a mano;
 *   4. cualquier otro error, en texto.
 *
 * 🔑 **El `POST` manda sólo la fecha** de la propuesta: el servidor rehace la cuenta, porque entre que se mostró y se confirmó pudo
 * cambiar el precio vigente o el índice. El importe de la pantalla no viaja.
 *
 * 🔴 Los importes, el coeficiente y los valores del índice son texto decimal: se reordenan para mostrarlos, no pasan por `number`.
 */
import { useCallback, useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useIndices } from '@/hooks/use-indices'
import { contratos, faltaDeIndice, mensajeDeError } from '@/lib/api'
import type { ContratoDetalle, FaltaDeIndice, PropuestaDeAjuste } from '@/lib/api'
import { METODO_INDICE, METODO_PORCENTAJE, etiquetaDe, PERIODICIDADES } from '@/lib/dominio'
import { fecha } from '@/lib/fechas'
import { conSigno, numeroArgentino, pesos, porcentaje } from '@/lib/importes'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'propuesta'; propuesta: PropuestaDeAjuste }
  | { tipo: 'falta'; falta: FaltaDeIndice }
  | { tipo: 'sin-ajuste'; mensaje: string }

/** Se muestra sólo para un contrato vigente con método por porcentaje o por índice. */
export function seAjusta(c: Pick<ContratoDetalle, 'estado' | 'metodo_ajuste'>): boolean {
  return c.estado === 'vigente' && (c.metodo_ajuste === METODO_INDICE || c.metodo_ajuste === METODO_PORCENTAJE)
}

function Cifra({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={fuerte ? 'text-base font-semibold' : 'text-sm'}>{valor}</dd>
    </div>
  )
}

export function AjusteDelContrato({ contrato, onAplicado }: {
  contrato: ContratoDetalle
  /** El contrato como quedó después de aplicar (con su historial de precios nuevo). */
  onAplicado: (contrato: ContratoDetalle) => void
}) {
  const { indices } = useIndices()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const moneda = contrato.moneda

  const consultar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    try {
      setEstado({ tipo: 'propuesta', propuesta: await contratos.proponerAjuste(contrato.id) })
    } catch (e) {
      const falta = faltaDeIndice(e)
      if (falta) setEstado({ tipo: 'falta', falta })
      else setEstado({ tipo: 'sin-ajuste', mensaje: mensajeDeError(e) })
    }
  }, [contrato.id])

  // 🔑 Se vuelve a pedir cuando cambia el precio vigente (por este ajuste o por un «Actualizar precio» a mano): la propuesta se calcula
  // sobre el precio vigente, así que una de antes de ese cambio quedó vieja.
  useEffect(() => {
    void consultar()
  }, [consultar, contrato.precio_vigente_desde])

  async function aplicar(propuesta: PropuestaDeAjuste) {
    setError(null)
    try {
      const { contrato: nuevo } = await contratos.aplicarAjuste(contrato.id, propuesta.fecha_ajuste)
      // La propuesta vieja se saca ya: hasta que llegue la nueva seguiría ofreciendo aplicar un ajuste que acaba de aplicarse.
      setEstado({ tipo: 'cargando' })
      onAplicado(nuevo)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const propuesta = estado.tipo === 'propuesta' ? estado.propuesta : null
  const ajuste = propuesta?.ajuste ?? null
  const porIndice = ajuste?.metodo === 'indice'
  const indiceFaltante = estado.tipo === 'falta' ? indices.find((i) => i.clave === estado.falta.indice) : undefined

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {contrato.metodo_ajuste === METODO_INDICE ? 'Ajuste por índice' : 'Ajuste por porcentaje'}
        </CardTitle>
        {ajuste && (
          <Button size="sm" onClick={() => { setError(null); setConfirmando(true) }}>
            <TrendingUp className="size-4" />
            Aplicar ajuste
          </Button>
        )}
        {estado.tipo === 'falta' && (
          <Button size="sm" variant="outline" onClick={() => void consultar()}>
            Volver a consultar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Puede tardar: si falta un valor, el backend lo baja de la fuente antes de contestar. */}
        {estado.tipo === 'cargando' && <p className="text-muted-foreground">Calculando el ajuste…</p>}

        {estado.tipo === 'sin-ajuste' && <p className="text-muted-foreground">{estado.mensaje}</p>}

        {estado.tipo === 'falta' && (
          <div className="space-y-1" role="status">
            <p>{estado.falta.mensaje}</p>
            <p className="text-muted-foreground">
              Faltan los valores de {estado.falta.indice_nombre} de: {estado.falta.fechas_faltantes.map((f) => fecha(f)).join(', ')}.
            </p>
            {indiceFaltante && !indiceFaltante.se_baja_solo && (
              <p className="text-muted-foreground">Este índice se carga a mano: no se baja solo de ninguna fuente.</p>
            )}
          </div>
        )}

        {propuesta && !ajuste && (
          <div className="space-y-1">
            <p>
              {propuesta.motivo === 'primer_periodo' ? 'Todavía no cumplió su primer período de ajuste' : 'El período en curso ya está ajustado'}
              ; el próximo ajuste es el {fecha(propuesta.proximo_ajuste)}.
            </p>
            <p className="text-muted-foreground">
              Alquiler vigente: {pesos(propuesta.precio_vigente, moneda)} desde el {fecha(propuesta.precio_vigente_desde)}.
            </p>
          </div>
        )}

        {propuesta && ajuste && (
          <>
            <dl className="grid gap-3 sm:grid-cols-4">
              <Cifra etiqueta="Alquiler vigente" valor={pesos(ajuste.importe_anterior, moneda)} />
              <Cifra etiqueta="Alquiler ajustado" valor={pesos(ajuste.importe_nuevo, moneda)} fuerte />
              <Cifra etiqueta="Variación" valor={`${conSigno(ajuste.variacion_pct)} %`} />
              <Cifra etiqueta="Rige desde" valor={fecha(propuesta.fecha_ajuste)} />
            </dl>
            <p className="text-muted-foreground">
              {porIndice
                ? `${ajuste.indice_nombre}. Coeficiente ${numeroArgentino(ajuste.coeficiente, 0)}.`
                : `${porcentaje(ajuste.porcentaje, 2)} compuesto ${ajuste.periodos} ${ajuste.periodos === 1 ? 'vez' : 'veces'} (${etiquetaDe(PERIODICIDADES, contrato.periodicidad_ajuste).toLowerCase()}). Coeficiente ${numeroArgentino(ajuste.coeficiente, 0)}.`}
            </p>
            {porIndice && ajuste.valores && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-normal">Fecha</th>
                      <th className="py-2 pr-3 font-normal">Valor</th>
                      <th className="py-2 pr-3 font-normal">Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ajuste.valores.map((v) => (
                      <tr key={v.fecha} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          {fecha(v.fecha)}
                          {v.fecha_pedida && <span className="text-muted-foreground"> (se pidió el {fecha(v.fecha_pedida)})</span>}
                        </td>
                        <td className="py-2 pr-3 font-medium">{numeroArgentino(v.valor, 0)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{v.fuente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <AvisoDeError mensaje={error} />
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Aplicar el ajuste?"
        description={
          ajuste && propuesta
            ? `El alquiler pasa de ${pesos(ajuste.importe_anterior, moneda)} a ${pesos(ajuste.importe_nuevo, moneda)} (${conSigno(ajuste.variacion_pct)} %), vigente desde el ${fecha(propuesta.fecha_ajuste)}. El precio vigente se cierra el día anterior y el nuevo queda en el historial.`
            : undefined
        }
        confirmLabel="Aplicar ajuste"
        onConfirm={() => {
          setConfirmando(false)
          if (propuesta) void aplicar(propuesta)
        }}
      />
    </Card>
  )
}
