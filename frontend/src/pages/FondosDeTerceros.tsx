/**
 * El control de fondos de terceros: cuánto se les debe a los propietarios y cuánto deben los inquilinos (ADR-007, punto 6).
 *
 * 🔑 **Lo que se les debe a los propietarios es plata ajena**: tiene que estar en la cuenta de la inmobiliaria. Es el número que el
 * dueño mira para saber si puede pagar las liquidaciones sin tocar lo propio. Cada propietario con saldo enlaza a su liquidación nueva
 * (`/liquidaciones/nueva?propietario=`), que es la forma de saldarle la cuenta.
 *
 * Los saldos salen del libro de terceros del motor (debe − haber) y llegan como texto decimal; sólo se muestran.
 *
 * 🔑 **Nunca se suman monedas distintas**: la API trae un total por moneda (`totales`) y cada fila dice la suya. Un propietario con
 * saldo en pesos y en dólares sale en dos filas, cada una con su enlace para liquidarle esa moneda.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, PiggyBank } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { mensajeDeError, reportes } from '@/lib/api'
import type { FondosDeTerceros as Fondos } from '@/lib/api'
import { nombreDeMoneda } from '@/lib/dominio'
import { pesos } from '@/lib/importes'

/** Los totales de las monedas que aparecen en las filas de una tabla (en el orden en que la API los manda). */
function totalesDe(fondos: Fondos, filas: { moneda: string }[]) {
  return fondos.totales.filter((t) => filas.some((f) => f.moneda === t.moneda))
}

export function FondosDeTerceros() {
  const [fondos, setFondos] = useState<Fondos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reportes
      .fondosDeTerceros()
      .then(setFondos)
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [])

  return (
    <div className="space-y-3">
      <TituloPantalla icono={PiggyBank}>Fondos de terceros</TituloPantalla>
      <p className="text-sm text-muted-foreground">
        Lo que se les debe a los propietarios es plata ajena: tiene que estar en la cuenta de la inmobiliaria. Lo que deben los inquilinos
        es lo que todavía no se cobró.
      </p>

      <AvisoDeError mensaje={error} />
      {!fondos && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {fondos && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">Se les debe a los propietarios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-2xl font-semibold">
                {fondos.totales.map((t) => (
                  <div key={t.moneda} data-testid={`a-pagar-${t.moneda}`}>
                    {pesos(t.a_pagar, t.moneda)}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">Deben los inquilinos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-2xl font-semibold">
                {fondos.totales.map((t) => (
                  <div key={t.moneda} data-testid={`adeudado-${t.moneda}`}>
                    {pesos(t.adeudado, t.moneda)}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">A pagar a propietarios</CardTitle>
            </CardHeader>
            <CardContent>
              {fondos.a_pagar_a_propietarios.length === 0 ? (
                <p className="text-sm text-muted-foreground">No se le debe nada a ningún propietario.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Propietario</TableHead>
                      <TableHead className="text-right">Se le debe</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Liquidación</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fondos.a_pagar_a_propietarios.map((p) => (
                      <TableRow key={`${p.tercero_id}-${p.moneda}`}>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell className="text-right">{pesos(p.saldo, p.moneda)}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              to={`/liquidaciones/nueva?propietario=${p.tercero_id}&moneda=${p.moneda}`}
                              aria-label={`Liquidar a ${p.nombre} en ${nombreDeMoneda(p.moneda)}`}
                            >
                              <FileSpreadsheet className="size-4" />
                              Liquidar
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    {totalesDe(fondos, fondos.a_pagar_a_propietarios).map((t) => (
                      <TableRow key={t.moneda}>
                        <TableCell>Total a pagar en {nombreDeMoneda(t.moneda)}</TableCell>
                        <TableCell className="text-right font-semibold">{pesos(t.a_pagar, t.moneda)}</TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inquilinos deudores</CardTitle>
            </CardHeader>
            <CardContent>
              {fondos.inquilinos_deudores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ningún inquilino debe nada.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Inquilino</TableHead>
                      <TableHead className="text-right">Debe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fondos.inquilinos_deudores.map((i) => (
                      <TableRow key={`${i.tercero_id}-${i.moneda}`}>
                        <TableCell className="font-medium">{i.nombre}</TableCell>
                        <TableCell className="text-right">{pesos(i.saldo, i.moneda)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    {totalesDe(fondos, fondos.inquilinos_deudores).map((t) => (
                      <TableRow key={t.moneda}>
                        <TableCell>Total adeudado en {nombreDeMoneda(t.moneda)}</TableCell>
                        <TableCell className="text-right font-semibold">{pesos(t.adeudado, t.moneda)}</TableCell>
                      </TableRow>
                    ))}
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
