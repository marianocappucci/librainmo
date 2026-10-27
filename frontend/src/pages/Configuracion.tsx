/**
 * Configuración de LibraInmo: la pantalla de la familia (`libra-ui/Configuracion`), con lo que este producto tiene montado.
 *
 * El armado, las pestañas y el botón de *Backup rápido* son del kit; acá sólo se declara qué corresponde.
 *
 * - **Empresa**: los datos de la inmobiliaria y el logo, contra `/api/config/empresa` (`build_empresa_router` +
 *   `build_empresa_admin_router`: leen todos los roles, escribe el administrador).
 * - **Datos / Backup**: copias de seguridad, descarga y restauración, contra `/api/config/backups`, `/backup-ahora` y `/restore`
 *   (`build_backup_router`, sólo administrador).
 *
 * - **Integraciones → Email / SMTP**: el correo saliente de la instancia, con el que se manda el enlace de recuperación de contraseña. Contra
 *   `/admin/smtp` y `/admin/smtp/probar` (`build_smtp_settings_router` + `build_smtp_probe_router` en `app/main.py`, sólo administrador).
 *
 * 🔴 **El correo es la única integración, a propósito.** Una pestaña de MercadoPago o ARCA sin sus endpoints guardaría credenciales que
 * nadie lee y daría 404 en cada carga: LibraInmo todavía no monta `mp_config_router` ni el de ARCA. Cuando se monte uno, se declara acá
 * (`integraciones: { arca: { empresa: '…' } }`) junto con `email`, y la pestaña pasa a tener sub-navegación. Si se saca el router de SMTP de
 * `main.py`, se saca también `email` de acá, o la tarjeta da 404 en cada carga.
 */
import { createConfiguracion } from 'libra-ui/Configuracion'
import { ICONOS } from 'libra-ui/iconos-identidad'

export const Configuracion = createConfiguracion({
  // El icono que el sidebar le da a /configuracion (el del catálogo de identidad del kit).
  icono: ICONOS.configuracion,
  // Sale en el tutorial de Gmail del correo, que le pide al cliente que nombre **este** sistema.
  producto: 'LibraInmo',
  integraciones: { email: true },
})
