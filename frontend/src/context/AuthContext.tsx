// Shim sobre libra-ui/AuthContext (mismo patrón que el resto de la familia).
//
// La instancia pre-configurada del kit apunta a `/auth/me`, `/auth/login` y
// `/auth/logout`, que son **exactamente** las tres rutas que monta
// `build_json_api_auth_router()` en `app/routers/auth.py`. Por eso alcanza con
// re-exportar. Y trae el gate de Términos: con una sesión iniciada, el
// provider consulta `GET /terminos` y, si la versión vigente está pendiente de
// aceptar, muestra la pantalla de aceptación en lugar de la aplicación.
//
// El `User` que devuelve el kit es el contrato completo de `_UserOut` de
// libraauth (`id`, `username`, `name`, `role`, `active`).
export { AuthProvider, useAuth } from 'libra-ui/AuthContext'
