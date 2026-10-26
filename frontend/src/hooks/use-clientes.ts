/**
 * Los clientes del motor para los campos que eligen uno (inquilino, titular, garante): la lista, las opciones del
 * `SelectCliente` y su alta en el lugar.
 *
 * 🔑 Un cliente dado de alta desde el campo (`crearYSumar`, ADR-071) se suma a la lista de la pantalla sin recargar, así queda en las
 * opciones de TODOS los campos que comparten este hook (las filas del editor de titulares, por ejemplo).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OpcionSelect } from 'libra-ui/SelectBuscable'
import { crearYSumar } from 'libra-ui/comercio/alta-de-cliente'
import { opcionesCliente, type ClienteDeVenta } from 'libra-ui/comercio/tipos'

import { clientes as api, mensajeDeError } from '@/lib/api'

/** Los inactivos se ven (con su pista «inactivo») pero no se pueden elegir. `activo` puede faltar: sólo `0` es inactivo. */
export function opcionesDeClientes(lista: ClienteDeVenta[]): OpcionSelect[] {
  const inactivos = new Set(lista.filter((c) => c.activo === 0).map((c) => String(c.id)))
  return opcionesCliente(lista).map((o) => (inactivos.has(o.value) ? { ...o, disabled: true } : o))
}

export function useClientes() {
  const [lista, setLista] = useState<ClienteDeVenta[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    api
      .listar()
      .then((l) => vigente && setLista(l))
      .catch((e: unknown) => vigente && setError(mensajeDeError(e)))
    return () => {
      vigente = false
    }
  }, [])

  const sumar = useCallback(
    (c: ClienteDeVenta) => setLista((previos) => (previos.some((p) => p.id === c.id) ? previos : [...previos, c])),
    [],
  )
  const opciones = useMemo(() => opcionesDeClientes(lista), [lista])
  const crear = useMemo(() => crearYSumar<ClienteDeVenta>(sumar), [sumar])

  return { opciones, crear, error }
}
