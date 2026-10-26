// Guard: todo campo donde se elige un cliente —acá, un INQUILINO, un PROPIETARIO o un GARANTE— ofrece darlo de alta ahí mismo
// (ADR-071, libra-ui v0.158.0).
//
// 🔴 **Lee los FUENTES, no el DOM.** Lo que hay que impedir es que vuelva a nacer un desplegable de inquilinos sin el botón «Agregar
// nuevo» (el caso que lo originó: el mostrador de LibraDesk, donde un cliente no cargado no se podía elegir). Eso se ve en el JSX. El
// motor vive en `libra-ui/auditoria-de-clientes` y tiene sus propios tests allá.
//
// En LibraInmo el cliente se llama **inquilino**, **propietario** o **garante** (todos son filas de `clients` del motor, ADR-002), por eso
// las palabras. Un campo de cliente es `SelectCliente`. Un *filtro* o un campo que no crea nada se marca con `cliente-sin-alta: <motivo>`
// en su renglón o en los tres de arriba.
//
// 🟡 **Hoy no hay ningún campo de cliente**, así que el control exige sólo que el guard haya leído archivos. Cuando entre el primero
// (el contrato, que elige inquilino y propietario), se sube el piso: `campos > 0` y `conAlta >= 1`.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditarCamposDeCliente, describirCamposSinAlta } from 'libra-ui/auditoria-de-clientes'

const SRC = join(process.cwd(), 'src')

describe('todo campo donde se elige un inquilino, un propietario o un garante ofrece el alta', () => {
  const r = auditarCamposDeCliente(SRC, { palabras: ['client', 'inquilino', 'propietario', 'garante', 'tenant', 'owner'] })

  it('🔴 el control — el guard leyó los fuentes (un parser que no lee nada sería un falso verde)', () => {
    expect(r.archivos).toBeGreaterThan(0)
  })

  it('ningún campo de cliente deja de ser SelectCliente, salvo los marcados `cliente-sin-alta: <motivo>`', () => {
    expect(describirCamposSinAlta(r.infracciones)).toEqual([])
  })
})
