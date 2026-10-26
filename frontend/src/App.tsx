import { Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { Inicio } from '@/pages/Inicio'
import { Login } from '@/pages/Login'
import { Logs } from '@/pages/Logs'
import { Usuarios } from '@/pages/Usuarios'

// Exportado para el test de ruteo: lo que hay que poder montar es ESTO, con un `MemoryRouter` alrededor. `App` trae su propio
// `AuthProvider`, que en el test se mockea.
export function Ruteo() {
  const { user, loading } = useAuth()

  // Mientras no se sepa si hay sesión no se decide nada: con un `if (!user)` directo, cada recarga mandaría al login a alguien que ya
  // estaba adentro.
  if (loading) return <p className="p-6 text-muted-foreground">Cargando…</p>

  // Este producto no rutea el login: sin sesión devuelve `<Login />` para cualquier URL, y al entrar el login manda a Inicio. Los
  // Términos pendientes los resuelve el `AuthProvider`.
  if (!user) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/inicio" element={<Inicio />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/logs" element={<Logs />} />
        {/* Las rutas no llevan guarda de rol: el permiso lo decide el servidor, y una ruta escondida que igual carga datos no protege
            nada. Lo que las pantallas hacen es no ofrecer botones que van a dar 403. */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <AuthProvider>
      <Ruteo />
    </AuthProvider>
  )
}
