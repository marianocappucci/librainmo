import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FilePenLine } from 'lucide-react'
import { TituloPantalla } from 'libra-ui/titulo-pantalla'

import { FormularioDeContrato } from '@/components/FormularioDeContrato'
import { Button } from '@/components/ui/button'

/** El alta de un contrato, en página propia (no en un diálogo: son más de quince campos). Nace en borrador; se activa desde su ficha.
 *  Desde la ficha de una propiedad llega con `?propiedad=<id>` y esa propiedad ya elegida. */
export function ContratoNuevo() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  return (
    <div className="space-y-3">
      <TituloPantalla
        icono={FilePenLine}
        acciones={
          <Button asChild variant="outline">
            <Link to="/contratos">
              <ArrowLeft className="size-4" />
              Volver
            </Link>
          </Button>
        }
      >
        Nuevo contrato
      </TituloPantalla>
      <p className="text-sm text-muted-foreground">
        El contrato queda en borrador. Se activa desde su ficha, cuando la propiedad tiene sus titulares completos.
      </p>
      <FormularioDeContrato propiedadInicial={params.get('propiedad') ?? undefined} onCancelar={() => navigate('/contratos')} />
    </div>
  )
}
