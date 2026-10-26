// Guard: todo desplegable de datos se busca escribiendo (ADR-039, libra-ui v0.129.0).
//
// 🔴 **Lee los FUENTES, no el DOM.** Lo que hay que impedir no es que una pantalla se rompa sino que vuelva a nacer un desplegable de datos
// (inquilinos, propiedades, índices…) que no se puede buscar. Eso se ve en el JSX, no en un render con datos de prueba. El motor vive en
// `libra-ui/auditoria-de-selects` y tiene sus propios tests allá.
//
// Un desplegable de datos es `SelectBuscable`. Uno de lista cerrada (un enum del código) puede seguir siendo `<Select>`/`<select>` si lleva
// un comentario `select-cerrado: <motivo>` en su renglón o en los tres de arriba; los de ≤ 8 opciones escritas a mano no necesitan marca.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditarSelects, describirInfracciones } from 'libra-ui/auditoria-de-selects'

const SRC = join(process.cwd(), 'src')

describe('los desplegables de datos se buscan escribiendo', () => {
  const r = auditarSelects(SRC)

  // Desplegables de DATOS que hay hoy: la propiedad del contrato (`CampoBuscable` → `SelectBuscable`), y los de cliente (`SelectCliente`, que
  // los arma sobre `SelectBuscable` del kit). Los de lista cerrada (tipo, estado, moneda, método de ajuste…) pasan todos por UN solo
  // `<Select>` marcado `select-cerrado:` (`components/SelectCerrado.tsx`): `desplegables` es 1 y `marcados` también.
  it('🔴 el control — el guard leyó los fuentes y encontró el desplegable cerrado marcado (un parser que no lee nada sería un falso verde)', () => {
    expect(r.archivos).toBeGreaterThan(0)
    expect(r.desplegables).toBeGreaterThanOrEqual(1)
    expect(r.marcados).toBeGreaterThanOrEqual(1)
  })

  it('ningún desplegable de datos (ni uno de más de 8 opciones fijas) deja de ser SelectBuscable', () => {
    expect(describirInfracciones(r.infracciones)).toEqual([])
  })
})

// ── La × de un SelectBuscable con centinela ────────────────────────────────────────────────────────────────────────────────────────────
//
// 🔴 Hasta libra-ui v0.129.0 el campo ofrecía por defecto una × que vacía la selección; desde la v0.129.1 **sólo con `limpiable`**. Un uso con un
// centinela propio (`{ value: TODOS, label: 'Todos' }`, `NONE`, `SIN_DEPOSITO`…) no debe pedirla: con «Todos» elegido la × mandaría `''`, que el
// estado de la pantalla no entiende (`Number('')` es 0: el filtro por cliente se queda sin resultados, o un `actualizarCampo({ cliente_id: 0 })`
// llega al backend), y ningún test ni el JSX lo muestran: sólo apretando la ×. Lo que se vigila ahora es que nadie le ponga `limpiable` (o
// `limpiable={true}`) a un campo así; `limpiable={false}` sigue siendo válido (y redundante). Se lee en los fuentes, igual que el guard de arriba.
function fuentesTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === 'test') return []
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return fuentesTsx(ruta)
    return nombre.endsWith('.tsx') && !nombre.endsWith('.test.tsx') ? [ruta] : []
  })
}

/** Cada `<SelectBuscable …/>` de un fuente, con su renglón. El `>` de una flecha o de un `a > b` adentro de `{…}` no cierra la etiqueta. */
function usosDeSelectBuscable(fuente: string): { linea: number; etiqueta: string }[] {
  const usos: { linea: number; etiqueta: string }[] = []
  for (const m of fuente.matchAll(/<SelectBuscable\b/g)) {
    let llaves = 0
    let i = m.index + m[0].length
    for (; i < fuente.length; i++) {
      const c = fuente[i]
      if (c === '{') llaves++
      else if (c === '}') llaves--
      else if (c === '>' && llaves === 0 && fuente[i - 1] !== '=') break
    }
    usos.push({ linea: fuente.slice(0, m.index).split('\n').length, etiqueta: fuente.slice(m.index, i + 1) })
  }
  return usos
}

/** ¿La etiqueta tiene una opción de valor-constante (`value: TODOS,`) **y** pide la × (`limpiable`, `limpiable={true}`, no `limpiable={false}`)? */
function pideLaCruzConUnCentinela(etiqueta: string): boolean {
  return /value:\s*[A-Z][A-Z_]+\s*,/.test(etiqueta) && /\blimpiable\b(?!=\{false\})/.test(etiqueta)
}

describe('un SelectBuscable con un centinela propio no ofrece la ×', () => {
  const todos = fuentesTsx(SRC).flatMap((ruta) =>
    usosDeSelectBuscable(readFileSync(ruta, 'utf8')).map((u) => ({ ...u, archivo: relative(SRC, ruta).replaceAll('\\', '/') })))

  // `todos` tiene el `SelectBuscable` de `CampoBuscable` (la propiedad del contrato, el índice, el concepto de un cargo, la propiedad de un
  // gasto) y los filtros de contrato, propiedad y propietario de Cuotas, Cobros, Gastos y Liquidaciones, todos con la opción «Todos» como
  // centinela: es justamente el caso que vigila el predicado de abajo. Los dos controles siguientes prueban ese predicado.
  it('🔴 el control — hay usos de SelectBuscable que mirar, y los de centinela están (el guard vigila algo)', () => {
    expect(todos.length).toBeGreaterThanOrEqual(5)
    expect(new Set(todos.map((u) => u.archivo))).toEqual(
      new Set(['components/campos.tsx', 'pages/Cobros.tsx', 'pages/Cuotas.tsx', 'pages/Gastos.tsx', 'pages/Liquidaciones.tsx']),
    )
  })

  it('🔴 el control — el predicado marca un centinela con `limpiable` y deja pasar los demás usos (un guard que no se pone rojo no vigila nada)', () => {
    const centinela = "<SelectBuscable value={v} onChange={f} opciones={[{ value: TODOS, label: 'Todos' }, ...xs]}"
    expect(pideLaCruzConUnCentinela(`${centinela} limpiable />`)).toBe(true)
    expect(pideLaCruzConUnCentinela(`${centinela} limpiable={true} />`)).toBe(true)
    expect(pideLaCruzConUnCentinela(`${centinela} />`)).toBe(false)
    expect(pideLaCruzConUnCentinela(`${centinela} limpiable={false} />`)).toBe(false)
    expect(pideLaCruzConUnCentinela("<SelectBuscable value={v} onChange={f} opciones={xs} limpiable />")).toBe(false)
  })

  it('un uso con una opción de valor-constante (TODOS, NONE, SIN_…) no lleva `limpiable`: la × mandaría \'\' y el estado no lo entiende', () => {
    const infracciones = todos
      .filter((u) => pideLaCruzConUnCentinela(u.etiqueta))
      .map((u) => `${u.archivo}:${u.linea}: <SelectBuscable> con una opción de valor-constante y con limpiable: la × mandaría '' y el estado no lo entiende`)
    expect(infracciones).toEqual([])
  })
})
