import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FilePenLine } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { FormularioDeContrato } from '@/components/FormularioDeContrato'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { contratos, mensajeDeError } from '@/lib/api'
import type { ContratoDetalle } from '@/lib/api'

/** La edición de un contrato. 🔑 **Sólo un borrador se edita entero** (ADR-004, punto 4): uno vigente cambia únicamente sus
 *  observaciones (desde su ficha) y el alquiler se actualiza con vigencia. Si se llega acá con otro estado, se dice y se vuelve a la ficha. */
export function ContratoEditar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [contrato, setContrato] = useState<ContratoDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    contratos
      .obtener(Number(id))
      .then(setContrato)
      .catch((e: unknown) => setError(mensajeDeError(e)))
  }, [id])

  const ficha = `/contratos/${id}`

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FilePenLine}
        acciones={
          <Button asChild variant="outline">
            <Link to={contrato ? ficha : '/contratos'}>
              <ArrowLeft className="size-4" />
              Volver
            </Link>
          </Button>
        }
      >
        {contrato ? `Editar ${contrato.numero}` : 'Editar contrato'}
      </TituloPantalla>

      <AvisoDeError mensaje={error} />
      {!contrato && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {contrato && contrato.estado !== 'borrador' && (
        <p className="text-sm text-muted-foreground">
          Un contrato {contrato.estado} ya no cambia sus condiciones: sólo se pueden editar las observaciones, desde su ficha.
        </p>
      )}
      {contrato && contrato.estado === 'borrador' && (
        <FormularioDeContrato contrato={contrato} onCancelar={() => navigate(ficha)} />
      )}
    </div>
  )
}
