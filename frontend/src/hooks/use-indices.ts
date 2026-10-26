/** El catálogo de índices de ajuste del motor (`GET /api/contratos/ajustes/indices`): para elegir el del contrato y para dar el nombre y
 *  decir si se baja solo. Se pide una vez por pantalla; mientras no llega (o si falla) la lista está vacía y las pantallas caen a lo
 *  que ya saben del contrato (`indice_ajuste_nombre`). */
import { useEffect, useMemo, useState } from 'react'
import type { OpcionSelect } from 'libra-ui/SelectBuscable'

import { contratos, mensajeDeError } from '@/lib/api'
import type { IndiceDeAjuste } from '@/lib/api'

export function opcionesDeIndices(lista: IndiceDeAjuste[]): OpcionSelect[] {
  return lista.map((i) => ({ value: i.clave, label: i.nombre, hint: i.se_baja_solo ? undefined : 'se carga a mano' }))
}

export function useIndices() {
  const [indices, setIndices] = useState<IndiceDeAjuste[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    contratos
      .indices()
      .then((l) => vigente && setIndices(l))
      .catch((e: unknown) => vigente && setError(mensajeDeError(e)))
    return () => {
      vigente = false
    }
  }, [])

  const opciones = useMemo(() => opcionesDeIndices(indices), [indices])
  return { indices, opciones, error }
}
