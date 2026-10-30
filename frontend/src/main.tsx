import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './index.css'
import { aplicarIdentidad } from 'libra-ui/identidad'
import { ErrorBoundary } from 'libra-ui/ErrorBoundary'
import { instalarReporteDeErrores } from 'libra-ui/errores-del-navegador'
import { cargarMarca } from 'libra-ui/marca'
import { cargarTema } from 'libra-ui/tema'

// La identidad del producto (libra-ui ADR-033 y ADR-096): el acento lima (botón principal, ítem activo del menú, foco), el `theme-color` y
// el favicon. Va antes de `cargarTema()`: el acento que el backoffice elige por instancia se aplica en línea y, por eso, le gana a éste.
aplicarIdentidad('librainmo')

// El tema de la suite (libra-ui ADR-007/008): aplica lo último guardado de inmediato (incluido el modo claro/oscuro) y pide los colores a
// esta misma instancia. No espera ni puede fallar: sin red o con un error, la app arranca con los colores de siempre.
void cargarTema()

// Los errores del navegador que nadie atrapa (`window.onerror`, promesas rechazadas) llegan al registro de errores de la instancia
// (`POST /api/errores-cliente`, libra-ui ADR-053 / libracore ADR-045). Antes de montar: lo que falle al montar también cuenta.
instalarReporteDeErrores()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('falta #root en index.html')

// La marca de la instancia (libra-ui ADR-098, marca blanca): si el revendedor cargó la suya, se aplica antes de pintar, así la primera visita
// no parpadea con el nombre del producto. Espera como mucho 2 s y nunca falla: sin marca propia la app arranca como siempre.
void cargarMarca().finally(() =>
  createRoot(raiz).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  ),
)
