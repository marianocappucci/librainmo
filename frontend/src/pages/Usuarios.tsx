/**
 * ABM de usuarios — el de `libra-ui`, apuntado al router de este producto.
 *
 * No se reimplementa nada: es la misma pantalla que ven los otros productos de
 * la familia, y lo único propio es la ruta del backend (`/api/usuarios`) y los
 * dos roles de LibraInmo con sus nombres legibles. El valor que viaja es el
 * código (`operador`); la etiqueta («Operador») es sólo presentación.
 */
import { UserCog } from 'lucide-react'
import { Usuarios as UsuariosCompartido } from 'libra-ui/Usuarios'

import { useAuth } from '@/context/AuthContext'
import { ROLES } from '@/lib/dominio'

export function Usuarios() {
  const { user } = useAuth()

  return (
    <div className="space-y-3">
      {/* El título lo pone la pantalla compartida, que recibe el icono del sidebar. */}
      <UsuariosCompartido
        icono={UserCog}
        basePath="/api/usuarios"
        roles={ROLES.map((r) => ({ value: r.value, label: r.label }))}
        // El backend usa `libraauth.usuarios.build_users_router()`, que trae el
        // `DELETE` con las guardas del único admin.
        permitirEliminar
        // Oculta «Eliminar» en la fila propia: el backend igual lo rechaza (409).
        usuarioActualId={user?.id}
      />
      <p className="text-sm text-muted-foreground">
        Los usuarios de esta instancia, que son el personal de la inmobiliaria. El administrador ve todo, incluidos
        los usuarios, la actividad y la copia de seguridad; el operador, el día a día.
      </p>
    </div>
  )
}
