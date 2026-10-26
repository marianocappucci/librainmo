/**
 * El control de fondos de terceros: cuánto se les debe a los propietarios y cuánto deben los inquilinos (ADR-007, punto 6).
 *
 * 🔑 **Lo que se les debe a los propietarios es plata ajena**: tiene que estar en la cuenta de la inmobiliaria. Es el número que el
 * dueño mira para saber si puede pagar las liquidaciones sin tocar lo propio. Cada propietario con saldo enlaza a su liquidación nueva
 * (`/liquidaciones/nueva?propietario=`), que es la forma de saldarle la cuenta.
 *
 * Los saldos salen del libro de terceros del motor (debe − haber) y llegan como texto decimal; sólo se muestran.
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
import { pesos } from '@/lib/importes'

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
              <CardContent className="text-2xl font-semibold">{pesos(fondos.total_a_pagar)}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">Deben los inquilinos</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{pesos(fondos.total_adeudado)}</CardContent>
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
                      <TableRow key={p.tercero_id}>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell className="text-right">{pesos(p.saldo)}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/liquidaciones/nueva?propietario=${p.tercero_id}`} aria-label={`Liquidar a ${p.nombre}`}>
                              <FileSpreadsheet className="size-4" />
                              Liquidar
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total a pagar</TableCell>
                      <TableCell className="text-right font-semibold">{pesos(fondos.total_a_pagar)}</TableCell>
                      <TableCell />
                    </TableRow>
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
                      <TableRow key={i.tercero_id}>
                        <TableCell className="font-medium">{i.nombre}</TableCell>
                        <TableCell className="text-right">{pesos(i.saldo)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total adeudado</TableCell>
                      <TableCell className="text-right font-semibold">{pesos(fondos.total_adeudado)}</TableCell>
                    </TableRow>
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
