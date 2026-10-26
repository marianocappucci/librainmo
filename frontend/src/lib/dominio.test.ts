import { describe, expect, it } from 'vitest'

import { ROLES, etiquetaDeRol } from './dominio'

describe('roles: la matriz de app/roles.py', () => {
  it('los dos roles del personal de la inmobiliaria, con etiqueta legible y en el orden de la matriz', () => {
    expect(ROLES.map((r) => `${r.value}=${r.label}`)).toEqual(['admin=Administrador', 'operador=Operador'])
  })

  it('la etiqueta de un rol; lo desconocido sale tal cual y sin rol sale vacío', () => {
    expect(etiquetaDeRol('operador')).toBe('Operador')
    expect(etiquetaDeRol('otro')).toBe('otro')
    expect(etiquetaDeRol(undefined)).toBe('')
  })
})
