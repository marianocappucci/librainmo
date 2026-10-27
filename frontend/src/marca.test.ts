// La marca de LibraInmo: el nombre está escrito en un solo lugar (`branding.ts`), y el color, el ícono y el fondo del login salen del kit.
//
// 🔴 **El modo de fallar es invisible.** El nombre del producto aparece en la pestaña, en el login y en la sidebar, que nunca se miran
// juntos: si uno se toca y los otros no, queda un «LibraInmo» y un «Libraimo» y nadie lo reporta. Y si una superficie volviera a un logo
// propio, o a la identidad de otro producto, el acento y el favicon dejarían de ser los de LibraInmo sin que falle nada. Este test los ata.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { svgDeMarca } from 'libra-ui/marcas'

import { PRODUCTO } from '@/branding'

const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')
const SUPERFICIES = ['src/pages/Login.tsx', 'src/components/Layout.tsx']

describe('la marca de LibraInmo', () => {
  it('🔴 el título de la pestaña dice lo mismo que `branding.ts`', () => {
    expect(leer('index.html')).toContain(`<title>${PRODUCTO}</title>`)
  })

  it('🔴 el login y la sidebar usan el nombre de `branding.ts` y la marca del kit, sin logo propio', () => {
    for (const archivo of SUPERFICIES) {
      const fuente = leer(archivo)
      expect(fuente, archivo).toMatch(/productName:\s*PRODUCTO/)
      expect(fuente, archivo).toMatch(/producto:\s*'librainmo'/)
      expect(fuente, archivo).not.toMatch(/\blogo:/)
    }
  })

  it('🔴 la identidad que se aplica al arrancar es la de LibraInmo', () => {
    const main = leer('src/main.tsx')
    expect(main).toMatch(/aplicarIdentidad\('librainmo'\)/)
    expect(main).not.toMatch(/aplicarIdentidad\(\s*'(?!librainmo')/)
  })

  it('el favicon estático es el del kit (el que se ve antes de que cargue el JS)', () => {
    expect(leer('public', 'favicon.svg').trim()).toBe(svgDeMarca('librainmo', 'favicon'))
  })
})
