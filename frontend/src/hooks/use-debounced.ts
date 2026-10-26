import { useEffect, useState } from 'react'

/** El valor, pero recién `ms` milisegundos después de que dejó de cambiar: para no pedirle a la API una consulta por tecla. */
export function useDebounced<T>(valor: T, ms = 250): T {
  const [retrasado, setRetrasado] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return retrasado
}
