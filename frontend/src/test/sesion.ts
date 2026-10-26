/**
 * La sesión de los tests de pantallas. Cada archivo mockea `@/context/AuthContext`
 * apuntando acá, así el rol se cambia por test sin armar un `AuthProvider`:
 *
 *     vi.mock('@/context/AuthContext', () => import('@/test/sesion').then((m) => m.mockDeAuth))
 *     ...
 *     sesion.rol = 'tecnico'
 */
export const sesion: { rol: string | null } = { rol: 'admin' }

export const mockDeAuth = {
  useAuth: () => ({
    user: sesion.rol
      ? { id: '1', username: 'usuario', name: 'Usuario de Prueba', role: sesion.rol, active: true }
      : null,
    loading: false,
    login: async () => undefined,
    logout: async () => undefined,
  }),
}
