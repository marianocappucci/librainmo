/**
 * Un `fetch` falso para los tests de pantallas: contesta según `MÉTODO /ruta` y
 * anota cada pedido para poder afirmar qué se mandó.
 *
 * Se doblan las respuestas HTTP y no el módulo de la API a propósito: así los
 * tests cubren también cómo `libra-ui/api-client` convierte un 409 o un 422 en
 * el mensaje que se ve en pantalla.
 *
 * Una ruta que no tiene respuesta declarada contesta 404 y queda en `pedidos`:
 * mejor un fallo que dice qué pidió la pantalla que una lista vacía inventada.
 */
import { vi } from 'vitest'

export type Pedido = { url: string; ruta: string; metodo: string; cuerpo: unknown; query: URLSearchParams }
type Contestar = Response | ((pedido: Pedido) => Response | Promise<Response>)

export function json(cuerpo: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** El error de dominio del backend: `{"detail": "texto"}` (409 y 422 de `app/errores.py`). */
export const error = (status: number, detail: string) => json({ detail }, status)

export function servidor(rutas: Record<string, Contestar>) {
  const pedidos: Pedido[] = []
  const tabla = { ...rutas }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada)
      const [ruta, consulta = ''] = url.split('?')
      const metodo = init?.method ?? 'GET'
      const pedido: Pedido = {
        url,
        ruta,
        metodo,
        cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
        query: new URLSearchParams(consulta),
      }
      pedidos.push(pedido)
      const respuesta = tabla[`${metodo} ${ruta}`]
      if (!respuesta) return error(404, `sin respuesta de prueba para ${metodo} ${ruta}`)
      return typeof respuesta === 'function' ? respuesta(pedido) : respuesta.clone()
    }),
  )
  return {
    pedidos,
    /** Los pedidos de `MÉTODO /ruta`, en orden. */
    de: (metodo: string, ruta: string) => pedidos.filter((p) => p.metodo === metodo && p.ruta === ruta),
    /** Cambia o agrega la respuesta de una ruta a mitad del test. */
    responder: (clave: string, respuesta: Contestar) => {
      tabla[clave] = respuesta
    },
  }
}
