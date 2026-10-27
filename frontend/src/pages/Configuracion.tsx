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
 * 🔴 **No hay `integraciones` a propósito.** Una pestaña de MercadoPago, ARCA o correo sin sus endpoints guardaría credenciales que nadie
 * lee y daría 404 en cada carga: LibraInmo todavía no monta `mp_config_router`, ni el de ARCA, ni el de SMTP. Cuando se monte uno, se
 * declara acá (`integraciones: { arca: { empresa: '…' } }`) y aparece la pestaña «Integraciones».
 */
import { createConfiguracion } from 'libra-ui/Configuracion'
import { ICONOS } from 'libra-ui/iconos-identidad'

export const Configuracion = createConfiguracion({
  // El icono que el sidebar le da a /configuracion (el del catálogo de identidad del kit).
  icono: ICONOS.configuracion,
  // Sale en los tutoriales de las integraciones, que hoy no se ofrecen; el kit lo exige igual.
  producto: 'LibraInmo',
})
