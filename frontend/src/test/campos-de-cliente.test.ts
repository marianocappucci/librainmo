// Guard: todo campo donde se elige un cliente —acá, un INQUILINO, un PROPIETARIO o un GARANTE— ofrece darlo de alta ahí mismo
// (ADR-071, libra-ui v0.158.0).
//
// 🔴 **Lee los FUENTES, no el DOM.** Lo que hay que impedir es que vuelva a nacer un desplegable de inquilinos sin el botón «Agregar
// nuevo» (el caso que lo originó: el mostrador de LibraDesk, donde un cliente no cargado no se podía elegir). Eso se ve en el JSX. El
// motor vive en `libra-ui/auditoria-de-clientes` y tiene sus propios tests allá.
//
// En LibraInmo el cliente se llama **inquilino**, **propietario**, **titular** o **garante** (todos son filas de `clients` del motor,
// ADR-002 y ADR-004), por eso las palabras. Un campo de cliente es `SelectCliente`. Un *filtro* o un campo que no crea nada se marca con
// `cliente-sin-alta: <motivo>` en su renglón o en los tres de arriba.
//
// Los campos que hay hoy (2026-10-26, tanda 1 del dominio): el **inquilino** del contrato (`FormularioDeContrato`), cada fila del editor
// de **titulares** de una propiedad (`EditorDeTitulares`) y el **garante** de una garantía (`GarantiasDelContrato`). El piso es de 3: si un
// campo de cliente deja de ser `SelectCliente`, o desaparece, esto se pone rojo y hay que decidirlo a propósito.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditarCamposDeCliente, describirCamposSinAlta } from 'libra-ui/auditoria-de-clientes'

const SRC = join(process.cwd(), 'src')

describe('todo campo donde se elige un inquilino, un propietario o un garante ofrece el alta', () => {
  const r = auditarCamposDeCliente(SRC, { palabras: ['client', 'inquilino', 'propietario', 'titular', 'garante', 'tenant', 'owner'] })

  it('🔴 el control — el guard leyó los fuentes y encontró los tres campos de cliente, todos con alta (un parser que devuelve cero sería un falso verde)', () => {
    expect(r.archivos).toBeGreaterThan(0)
    expect(r.campos).toBeGreaterThanOrEqual(3)
    expect(r.conAlta).toBeGreaterThanOrEqual(3)
    // Ninguno está exento por una marca: los tres dan de alta ahí mismo.
    expect(r.marcados).toBe(0)
  })

  it('🔴 los tres campos son el inquilino, el titular y el garante', () => {
    const archivos = r.todos.filter((c) => c.componente === 'SelectCliente').map((c) => c.archivo).sort()
    expect(archivos).toEqual(['components/EditorDeTitulares.tsx', 'components/FormularioDeContrato.tsx', 'components/GarantiasDelContrato.tsx'])
  })

  it('ningún campo de cliente deja de ser SelectCliente, salvo los marcados `cliente-sin-alta: <motivo>`', () => {
    expect(describirCamposSinAlta(r.infracciones)).toEqual([])
  })
})
