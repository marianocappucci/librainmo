import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, consulta, mensajeDeError } from './api'
import { error, json, servidor } from '@/test/servidor'

afterEach(() => vi.unstubAllGlobals())

describe('consulta: el query string', () => {
  it('omite lo vacío y repite los arreglos', () => {
    expect(consulta({ a: '1', b: '', c: undefined, d: null, e: 0, f: false })).toBe('?a=1&e=0&f=false')
    expect(consulta({ estado: ['vigente', 'por_vencer'] })).toBe('?estado=vigente&estado=por_vencer')
    expect(consulta({})).toBe('')
  })
})

describe('mensajeDeError: lo que se ve en pantalla', () => {
  it('un detail de texto (error de dominio del backend) sale tal cual', async () => {
    servidor({ 'POST /api/usuarios': error(409, 'Ese usuario ya existe.') })
    const err = await api.post('/api/usuarios', {}).catch((e: unknown) => e)
    expect(mensajeDeError(err)).toBe('Ese usuario ya existe.')
  })

  it('un detail en lista (validación de pydantic) se arma con el nombre del campo y sin el «Value error»', async () => {
    servidor({
      'POST /api/usuarios': json(
        {
          detail: [
            { loc: ['body', 'username'], msg: 'Field required', type: 'missing' },
            { loc: ['body', 'role'], msg: 'Value error, rol inválido', type: 'value_error' },
          ],
        },
        422,
      ),
    })
    const err = await api.post('/api/usuarios', {}).catch((e: unknown) => e)
    expect(mensajeDeError(err)).toBe('Usuario: Field required · Rol: rol inválido')
  })

  it('los 403 y 401 genéricos salen en castellano', async () => {
    servidor({ 'GET /api/usuarios': error(403, 'forbidden') })
    expect(mensajeDeError(await api.get('/api/usuarios').catch((e: unknown) => e))).toBe('No tenés permiso para hacer esto.')
  })

  it('algo que no es un error de la API es un error de conexión', () => {
    expect(mensajeDeError(new TypeError('Failed to fetch'))).toBe('Error de conexión.')
    expect(mensajeDeError(new ApiError(500, ''))).toBe('Error 500')
  })
})
