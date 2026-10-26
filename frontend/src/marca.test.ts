// La marca de LibraInmo está escrita en un solo lugar (`branding.ts`) y las demás superficies la usan.
//
// 🔴 **El modo de fallar es invisible.** El nombre del producto aparece en la pestaña, en el login y en la sidebar, que nunca se miran
// juntos: si uno se toca y los otros no, queda un «LibraInmo» y un «Libraimo» y nadie lo reporta. Este test los ata.
//
// Y LibraInmo NO usa todavía la identidad de otro producto de la familia: `aplicarIdentidad('libraclub')` pintaría el acento y el
// favicon de otro. Cuando `libra-ui/identidad` tenga a LibraInmo, este test se cambia por el de LibraClub (el acento sale del kit).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { LOGO, PRODUCTO } from '@/branding'

const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')

describe('la marca de LibraInmo', () => {
  it('🔴 el título de la pestaña dice lo mismo que `branding.ts`', () => {
    expect(leer('index.html')).toContain(`<title>${PRODUCTO}</title>`)
  })

  it('🔴 el login y la sidebar usan el nombre y el logo de `branding.ts`, no uno escrito a mano', () => {
    for (const archivo of ['src/pages/Login.tsx', 'src/components/Layout.tsx']) {
      const fuente = leer(archivo)
      expect(fuente, archivo).toMatch(/productName:\s*PRODUCTO/)
      expect(fuente, archivo).toMatch(/logo:\s*LOGO/)
    }
  })

  it('el logo es el archivo que sirve `public/favicon.svg`, y existe', () => {
    expect(LOGO.src).toBe('/favicon.svg')
    expect(leer('public', 'favicon.svg')).toContain('<svg')
  })

  it('🔴 no se aplica la identidad de OTRO producto de la familia', () => {
    const main = leer('src/main.tsx')
    expect(main).not.toMatch(/aplicarIdentidad\(\s*'(?!librainmo')/)
    for (const archivo of ['src/pages/Login.tsx', 'src/components/Layout.tsx']) {
      expect(leer(archivo), archivo).not.toMatch(/producto:\s*'(contalibra|restolibra|gestiolibra|medlibra|ventalibra|libradesk|libracargo|libraclub)'/)
    }
  })
})
