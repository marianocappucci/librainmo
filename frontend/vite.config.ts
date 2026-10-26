import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'

// Proxy de API en dev: el front (localhost:5173) le habla al backend por el
// MISMO origen, así la cookie de sesión funciona sin pelear con CORS/SameSite.
// En producción no hace falta, porque el build lo sirve el propio proceso
// FastAPI (ver `app/asgi.py`, que monta `frontend/dist` con `montar_spa`).
//
// 🔴 La cookie de `libraauth` (`inmo_session`) es `Secure`: sobre http el
// navegador la acepta pero no la reenvía. En dev anda igual porque `localhost`
// está exceptuado de esa regla; en cualquier otro host que no sea https, no.
//
// Las claves que empiezan con `^` las interpreta Vite como expresión regular, y
// piden que la ruta TERMINE ahí o siga con `/`: con un prefijo simple, una ruta
// de la SPA que empiece igual que una de la API (`/auth-algo`) quedaría
// secuestrada por el proxy y el navegador recibiría JSON en vez de la página.
//
// Estas son las mismas que `prefijos_api` de `app/asgi.py` (lo que el catch-all
// de la SPA NO se come), más la documentación de la API, que sólo existe en dev.
const RUTAS_API = ['/api', '/auth', '/terminos', '/salud', '/health', '/docs', '/openapi.json']

// 🔴 8107, el puerto de `docs/desarrollo-local.md` y de `docker-compose.yml`.
// Si cambia, cambia en los dos y acá. Se puede pisar con `LIBRAINMO_BACKEND`
// (por ejemplo, para probar contra otra instancia sin tocar el archivo).
const BACKEND = process.env.LIBRAINMO_BACKEND ?? 'http://localhost:8107'

export default defineConfig({
  plugins: [react(), tailwindcss(), Icons({ compiler: 'jsx', jsx: 'react' })],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    proxy: Object.fromEntries(
      RUTAS_API.map((ruta) => [
        `^${ruta.replace(/[.]/g, '\\.')}(?:/|$)`,
        { target: BACKEND, changeOrigin: true },
      ]),
    ),
  },
})
