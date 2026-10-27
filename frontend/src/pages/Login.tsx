// Shim sobre libra-ui/Login: el login de la familia, con el branding propio.
//
// Lo que se gana además del dibujo: el ojito de `PasswordInput`, el manejo de
// `ApiError` ya probado en el kit y, sobre todo, la pantalla de segundo paso si
// la instancia lo pide. Los Términos y Condiciones no pasan por acá: los
// atiende el `AuthProvider` apenas hay sesión.
//
// Los tres opcionales del kit van declarados, cada uno de la mano de lo que monta `app/routers/auth.py`:
//
// - `forgotPasswordPath`: el enlace «¿Olvidaste tu contraseña?». Sin esta línea el kit no lo pinta, la pantalla queda idéntica y no
//   falla nada. Lo atiende `PasswordReset.tsx`, con las rutas públicas de `App.tsx`.
// - `demoPath`: el botón «Entrar a la demo». Declararlo no alcanza para que aparezca: el kit consulta `GET /auth/demo` al montar y sólo
//   lo pinta si la instancia contesta que es una demo, así que en una instancia de cliente no se ve nada.
// - `captchaPath`: el recuadro «No soy un robot» (ALTCHA), que va SIEMPRE con `captcha=True` en el router. Mientras no se tilde,
//   «Ingresar» queda deshabilitado.
import { createLogin } from 'libra-ui/Login'

import { PRODUCTO, WORDMARK } from '@/branding'

export const Login = createLogin({
  productName: PRODUCTO,
  // `productInitial` es obligatorio en la config del kit aunque haya `producto`.
  productInitial: 'I',
  // La marca de la familia (libra-ui ADR-096): casa y llave sobre el lima; en el login, además, la foto del hero de fondo (ADR-092).
  producto: 'librainmo',
  wordmarkClassName: `${WORDMARK} text-[22px]`,
  // A Inicio: `App.tsx` manda cualquier ruta desconocida ahí mismo.
  redirectTo: '/inicio',
  forgotPasswordPath: '/forgot-password',
  demoPath: '/auth/demo',
  captchaPath: '/auth/captcha',
})
