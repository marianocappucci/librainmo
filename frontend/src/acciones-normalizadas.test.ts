// La columna de acciones de toda tabla lleva su título, y sus botones llevan borde.
//
// 🔴 **Lee los FUENTES, no el DOM**, igual que el guard de los iconos del título. Lo que hay que impedir no es que una pantalla se rompa
// —ninguna se rompe sin encabezado ni sin borde— sino que **vuelvan a divergir**, y eso sólo se ve mirando todas las tablas a la vez.
//
// Es la convención de la familia (LibraClub la fijó el 2026-08-28 tras encontrar tres columnas sin título y seis botones `ghost` sin
// borde que los delimite; LibraView y LibraClub tienen este mismo guard). Entró con la primera tabla de LibraInmo con una columna de
// acciones: las garantías y los conceptos de un contrato.
//
// En este producto las columnas de acciones se arman TODAS con `columnaDeAcciones` y `BotonDeFila` de `components/listado.tsx`: el guard
// vigila ese archivo (el título «Acciones», el `size` del kit, los botones `outline` con el nombre de la fila en el `aria-label`) y que
// ninguna pantalla escriba una columna de acciones a mano por fuera.
//
// ⚠️ `ghost` **no está prohibido**: sirve para controles adentro de un formulario. Lo que este guard mira es sólo lo que hay **dentro de
// una columna de acciones**.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

type Columna = { archivo: string; bloque: string }

/** Los archivos de pantalla y de componente (a cualquier profundidad), sin los tests ni las primitivas vendorizadas de `ui/`. */
function fuentes(): { nombre: string; texto: string }[] {
  const salida: { nombre: string; texto: string }[] = []
  const recorrer = (carpeta: string) => {
    for (const e of readdirSync(join(SRC, carpeta), { withFileTypes: true })) {
      const ruta = `${carpeta}/${e.name}`
      if (e.isDirectory()) {
        if (e.name !== 'ui') recorrer(ruta)
      } else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) {
        salida.push({ nombre: ruta, texto: readFileSync(join(SRC, ruta), 'utf8') })
      }
    }
  }
  for (const carpeta of ['pages', 'components']) recorrer(carpeta)
  return salida
}

/** Cada definición de columna de acciones, desde su `id` hasta que la sangría vuelve al nivel en el que abrió. Es lo que delimita un
 *  objeto de columna en estos archivos sin tener que parsear TypeScript. */
function columnasDeAcciones(): Columna[] {
  const encontradas: Columna[] = []
  for (const { nombre, texto } of fuentes()) {
    const lineas = texto.split('\n')
    for (let i = 0; i < lineas.length; i++) {
      const m = /^(\s*)id:\s*'acciones',/.exec(lineas[i])
      if (!m) continue
      const sangria = m[1]
      const bloque = [lineas[i]]
      for (let j = i + 1; j < lineas.length; j++) {
        bloque.push(lineas[j])
        if (lineas[j] === `${sangria}},`) break
      }
      encontradas.push({ archivo: nombre, bloque: bloque.join('\n') })
    }
  }
  return encontradas
}

const COLUMNAS = columnasDeAcciones()

describe('las columnas de acciones', () => {
  it('🔴 el control — el guard encontró la columna de acciones de verdad', () => {
    // Sin esto, los casos de abajo pasarían en verde el día que el regex deje de matchear: una lista vacía cumple cualquier condición.
    expect(COLUMNAS.length).toBeGreaterThanOrEqual(1)
    expect(COLUMNAS.map((c) => c.archivo)).toContain('components/listado.tsx')
  })

  it('🔴 todas llevan el título «Acciones»', () => {
    const sinTitulo = COLUMNAS.filter((c) => !/header:.*Acciones/.test(c.bloque)).map((c) => c.archivo)
    expect(sinTitulo).toEqual([])
  })

  it('🔴 sus botones llevan borde, no son `ghost`', () => {
    const sinBorde = COLUMNAS.filter((c) => /variant="ghost"/.test(c.bloque)).map((c) => c.archivo)
    expect(sinBorde).toEqual([])
  })

  it('🔴 la única columna de acciones escrita a mano es la de `components/listado.tsx`: las pantallas usan `columnaDeAcciones`', () => {
    expect(COLUMNAS.map((c) => c.archivo)).toEqual(['components/listado.tsx'])
  })

  it('🔴 el botón de una fila (`BotonDeFila`) es `outline`, de ícono y con el nombre de la fila en el `aria-label`', () => {
    const listado = fuentes().find((f) => f.nombre === 'components/listado.tsx')?.texto ?? ''
    const boton = /export function BotonDeFila[\s\S]*?\n}\n/.exec(listado)?.[0] ?? ''
    expect(boton).toContain('variant="outline"')
    expect(boton).toContain('size="icon"')
    expect(boton).not.toContain('ghost')
    // «Editar concepto Seguro», no un «Editar» pelado: con 40 filas, un lector de pantalla no sabría cuál es cuál.
    expect(boton).toMatch(/aria-label=\{`\$\{titulo\} \$\{fila\}`\}/)
  })

  it('🔴 el segundo control — el guard sabe reconocer una columna mal hecha', () => {
    // Los casos de arriba comparan contra una lista vacía, así que pasarían igual si los regex no matchearan nada. Acá se les da de comer
    // una columna rota a propósito y se verifica que la marquen.
    const rota = `        id: 'acciones',
        header: '',
        cell: () => <Button variant="ghost" size="icon" />,
        },`
    expect(/header:.*Acciones/.test(rota)).toBe(false)
    expect(/variant="ghost"/.test(rota)).toBe(true)

    // Y el positivo: una bien hecha no se marca.
    const sana = `        id: 'acciones',
        header: () => <div className="text-right">Acciones</div>,
        cell: () => <Button variant="outline" size="icon" />,
        },`
    expect(/header:.*Acciones/.test(sana)).toBe(true)
    expect(/variant="ghost"/.test(sana)).toBe(false)
  })
})
