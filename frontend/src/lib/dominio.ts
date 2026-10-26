/**
 * El vocabulario del dominio, tal como viaja en la API, y cómo se escribe en pantalla.
 *
 * Los códigos son parte del contrato con el backend; las etiquetas son sólo presentación y
 * se cambian acá, en un solo lugar. Hoy sólo están los roles; el vocabulario inmobiliario
 * (estados de la propiedad, métodos de ajuste, monedas…) entra con la fase 1.
 */

// ── Roles y permisos (`app/roles.py`) ───────────────────────────────────

export const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'operador', label: 'Operador' },
] as const

export type Rol = (typeof ROLES)[number]['value']

export function etiquetaDeRol(rol: string | undefined): string {
  return ROLES.find((r) => r.value === rol)?.label ?? rol ?? ''
}
