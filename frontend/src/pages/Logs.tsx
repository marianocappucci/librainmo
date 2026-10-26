// La pantalla vive en `libra-ui`, igual que `Usuarios`: es la misma en todos los productos — el backend le manda hasta la lista de
// entidades y los colores de cada acción.
//
// 🔴 Con `basePath`, porque el router NO va en el `/logs` que el kit trae por default: esa ruta es la de esta misma pantalla, y FastAPI
// resuelve sus rutas antes que el catch-all de la SPA — entrar a `/logs` devolvería el JSON crudo del endpoint. El backend lo monta en
// `/api/logs` (ver `app/main.py`), igual que `/api/usuarios`.
import { ScrollText } from 'lucide-react'
import { Logs as LogsCompartido } from 'libra-ui/Logs'

export function Logs() {
  return <LogsCompartido icono={ScrollText} basePath="/api/logs" />
}
