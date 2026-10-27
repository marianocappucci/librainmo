// Shim sobre libra-ui/Login: el login de la familia, con el branding propio.
//
// Lo que se gana además del dibujo: el ojito de `PasswordInput`, el manejo de
// `ApiError` ya probado en el kit y, sobre todo, la pantalla de segundo paso si
// la instancia lo pide. Los Términos y Condiciones no pasan por acá: los
// atiende el `AuthProvider` apenas hay sesión.
//
// Sin `forgotPasswordPath`, `demoPath` ni `captchaPath` a propósito: el backend
// de LibraInmo no monta todavía la recuperación de contraseña (necesita SMTP),
// el login de demo ni el captcha (`app/routers/auth.py`). Declararlos en la
// pantalla sin que el backend los atienda dejaría un enlace a un 404. Se suman
// los tres juntos cuando el router los incluya.
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
})
