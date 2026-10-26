// Shim sobre libra-ui/Layout: branding y navegación propios de LibraInmo.
//
// El kit no tiene barra superior: la navegación vive en el sidebar. Dos ítems del
// mismo menú no comparten dibujo — si comparten, el icono deja de distinguir y
// hay que leer el texto igual, que es lo que el icono venía a evitar. El icono
// de cada entrada es también el del título de su pantalla (`titulos-con-icono.test.ts`).
//
// El menú sigue la matriz de `app/roles.py`: lo que el rol no puede usar no se
// ofrece, porque un link que da 403 es peor que no tenerlo. El permiso lo decide
// el servidor; esto sólo evita ofrecer lo que va a fallar.
import { Outlet } from 'react-router-dom'
import { Building2, FilePenLine } from 'lucide-react'
import { createLayout } from 'libra-ui/Layout'
import { ICONOS } from 'libra-ui/iconos-identidad'

import { useAuth } from '@/context/AuthContext'
import { LOGO, PRODUCTO, WORDMARK } from '@/branding'
import { etiquetaDeRol } from '@/lib/dominio'

type Usuario = {
  role?: string
  name?: string
  username?: string
}

const Cascaron = createLayout<Usuario>({
  productName: PRODUCTO,
  productInitial: 'I',
  logo: LOGO,
  // 🔴 El interlineado va PEGADO al tamaño (`/[17px]`) y no como un `leading-*` aparte: en Tailwind v4 una utilidad de tamaño emite
  // TAMBIÉN su `line-height`, así que el `leading-none` de `libra-ui` pierde contra el `text-[15px]` de acá.
  wordmarkClassName: `${WORDMARK} text-[15px]/[17px]`,
  homeTo: '/inicio',
  navSections: [
    // Sin label: es lo del día a día. Las entradas de dominio se suman acá (cobros y liquidaciones, en las próximas fases).
    //
    // Propiedades y Contratos no están en el catálogo de íconos de identidad del kit (`libra-ui/iconos-identidad`): son conceptos de este
    // producto y, según su propia regla, no entran hasta que un segundo producto los necesite. Llevan íconos de lucide que no usa ningún
    // otro concepto del catálogo (`Building2`, `FilePenLine`: el mismo de los contratos de LibraDesk).
    {
      items: [
        { to: '/inicio', label: 'Inicio', icon: ICONOS.dashboard },
        // `activoEn`: la ficha de una propiedad o de un contrato (`/propiedades/3`, `/contratos/5/editar`) deja marcada la entrada de su listado.
        { to: '/propiedades', label: 'Propiedades', icon: Building2, activoEn: ['/propiedades'] },
        { to: '/contratos', label: 'Contratos', icon: FilePenLine, activoEn: ['/contratos'] },
      ],
    },
    {
      label: 'Administración',
      items: [
        { to: '/usuarios', label: 'Usuarios', icon: ICONOS.usuarios, adminOnly: true },
        // Junto a Usuarios: se mira para responder «quién hizo esto», que es una pregunta sobre la gente y no sobre los ajustes.
        { to: '/logs', label: 'Actividad', icon: ICONOS.logDeActividad, adminOnly: true },
      ],
    },
  ],
  // `name` es el nombre real de la persona y viene en el contrato de `libraauth`; el `|| username` es el piso para un usuario sembrado
  // sin nombre, que si no dejaría el pie del sidebar en blanco.
  getUserName: (u) => u.name || u.username || '',
  // El rol, legible, debajo del nombre del producto: «Operador», no `operador`.
  getUserSubtitle: (u) => etiquetaDeRol(u.role),
  useAuth: useAuth as unknown as () => { user: Usuario | null; logout: () => Promise<void> },
})

/** El cascarón del kit, adaptado al router de este producto.
 *
 *  `createLayout` devuelve un componente que recibe `children`; LibraInmo usa el patrón de **layout-route** de react-router (una
 *  ruta padre sin path, con las pantallas como rutas hijas), donde el contenido llega por `Outlet` y no como children. Este
 *  envoltorio traduce entre los dos. */
export function Layout() {
  return (
    <Cascaron>
      <Outlet />
    </Cascaron>
  )
}

export default Layout
