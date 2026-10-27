// Shim sobre libra-ui/PasswordReset, mismo patrón que Login.
//
// Las dos pantallas son **públicas**: van fuera del guard de sesión de `App.tsx`, porque quien las usa justamente no puede entrar.
import { createForgotPassword, createResetPassword } from 'libra-ui/PasswordReset'

import { PRODUCTO } from '@/branding'

// El mismo nombre que el login. El kit no recibe `producto` acá (la marca de la casa y el fondo son sólo del login): lleva la inicial.
const branding = { productName: PRODUCTO, productInitial: 'I' }

// El pedido de enlace lleva el mismo captcha que el login (sin él, el endpoint manda correos a pedido de cualquiera). El cambio de
// contraseña no: ahí ya hace falta el token que llegó por correo.
export const ForgotPassword = createForgotPassword({ ...branding, captchaPath: '/auth/captcha' })
export const ResetPassword = createResetPassword(branding)
