import { Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { CobrarCuota } from '@/pages/CobrarCuota'
import { CobroDetalle } from '@/pages/CobroDetalle'
import { Cobros } from '@/pages/Cobros'
import { ContratoDetalle } from '@/pages/ContratoDetalle'
import { ContratoEditar } from '@/pages/ContratoEditar'
import { ContratoNuevo } from '@/pages/ContratoNuevo'
import { Contratos } from '@/pages/Contratos'
import { CuotaDetalle } from '@/pages/CuotaDetalle'
import { Cuotas } from '@/pages/Cuotas'
import { CuotasGenerar } from '@/pages/CuotasGenerar'
import { FondosDeTerceros } from '@/pages/FondosDeTerceros'
import { Gastos } from '@/pages/Gastos'
import { Inicio } from '@/pages/Inicio'
import { LiquidacionDetalle } from '@/pages/LiquidacionDetalle'
import { LiquidacionNueva } from '@/pages/LiquidacionNueva'
import { Liquidaciones } from '@/pages/Liquidaciones'
import { Login } from '@/pages/Login'
import { Logs } from '@/pages/Logs'
import { PropiedadDetalle } from '@/pages/PropiedadDetalle'
import { Propiedades } from '@/pages/Propiedades'
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
        <Route path="/propiedades" element={<Propiedades />} />
        <Route path="/propiedades/:id" element={<PropiedadDetalle />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/contratos/nuevo" element={<ContratoNuevo />} />
        <Route path="/contratos/:id" element={<ContratoDetalle />} />
        <Route path="/contratos/:id/editar" element={<ContratoEditar />} />
        <Route path="/cuotas" element={<Cuotas />} />
        <Route path="/cuotas/generar" element={<CuotasGenerar />} />
        <Route path="/cuotas/:id" element={<CuotaDetalle />} />
        <Route path="/cuotas/:id/cobrar" element={<CobrarCuota />} />
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/cobros/:id" element={<CobroDetalle />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/liquidaciones" element={<Liquidaciones />} />
        <Route path="/liquidaciones/nueva" element={<LiquidacionNueva />} />
        <Route path="/liquidaciones/:id" element={<LiquidacionDetalle />} />
        <Route path="/fondos-de-terceros" element={<FondosDeTerceros />} />
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
