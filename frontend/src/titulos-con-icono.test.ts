// El icono del título es el que el sidebar le da a esa misma pantalla.
//
// 🔴 **Lee los FUENTES, no el DOM.** Lo que hay que impedir no es que una
// pantalla se rompa —ninguna se rompe con el icono equivocado— sino que
// **vuelvan a divergir**: eso se ve cruzando el mapa de navegación contra cada
// pantalla, y sólo si alguien se acuerda de cruzar. El motor vive en
// `libra-ui/auditoria-de-titulos` y tiene sus propios tests allá.
//
// ⚠️ **Lo que este guard NO cubre**: las pantallas que `libra-ui` rinde enteras
// —`/usuarios` y `/logs`—, porque no viven en `pages/` de
// este producto. A ésas las cubre el TIPO: desde la v0.34.0 el `icono` es una
// prop requerida, así que el compilador no deja montarlas sin pasarlo.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { auditarTitulos, describirDesajustes } from 'libra-ui/auditoria-de-titulos'

const SRC = join(process.cwd(), 'src')

// Ninguna pantalla de LibraInmo usa un ícono distinto al de su entrada del menú: la lista de excepciones está vacía.
const OTRO_CONCEPTO: string[] = []

describe('el icono del título sale del sidebar', () => {
  it('🔴 ninguna pantalla usa un icono distinto al de su entrada del menú', () => {
    const { distinto } = auditarTitulos(SRC)
    expect(describirDesajustes(distinto.filter((d) => !OTRO_CONCEPTO.includes(d.ruta)))).toEqual([])
    // Y la lista de exenciones es exacta: si una deja de diferir del sidebar, hay que sacarla de acá.
    expect(distinto.map((d) => d.ruta).sort()).toEqual([...OTRO_CONCEPTO].sort())
  })

  it('🔴 ninguna pantalla del menú tiene el título sin icono', () => {
    // La lista es EXACTA y no un «contiene»: una pantalla nueva sin icono hace fallar esto igual, que es lo que el guard viene a cuidar.
    expect(describirDesajustes(auditarTitulos(SRC).sinIcono)).toEqual([])
  })

  it('🔴 el control — el guard midió algo', () => {
    // Sin esto, los dos casos de arriba pasarían en verde si el parser dejara
    // de encontrar el Layout, el router o las pantallas: dos listas vacías
    // contra dos listas vacías. Es la forma en que este guard falló mientras se
    // escribía. Los pisos son los de hoy: diez entradas en el menú (Inicio, Propiedades, Contratos, Cuotas, Cobros, Gastos, Liquidaciones,
    // Fondos de terceros, Usuarios y Actividad) y veinte rutas bajo ellas, de las cuales dieciocho tienen título propio con su icono (Inicio,
    // dos de Propiedades, cuatro de Contratos, cuatro de Cuotas, dos de Cobros, Gastos, tres de Liquidaciones y Fondos de terceros);
    // se suben con cada pantalla que entre.
    const { rutasDelNav, pantallas, conIcono } = auditarTitulos(SRC)
    expect(rutasDelNav).toBeGreaterThanOrEqual(10)
    expect(pantallas).toBeGreaterThanOrEqual(20)
    expect(conIcono).toBeGreaterThanOrEqual(18)
  })

  it('🔴 las únicas rutas del menú sin título propio son las dos que rinde el kit entera (Usuarios y Actividad)', () => {
    // Una pantalla propia nueva sin `TituloPantalla` caería acá y no se vería como «correcta» por no tener título que comparar.
    expect(auditarTitulos(SRC).sinTitulo.map((d) => d.ruta).sort()).toEqual(['/logs', '/usuarios'])
  })
})
