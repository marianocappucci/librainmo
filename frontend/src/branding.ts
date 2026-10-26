// La identidad visual de LibraInmo: cómo se escribe el nombre y qué marca lleva.
//
// Vive en un archivo propio porque lo usan las DOS superficies que lo muestran
// —el login y la sidebar— y son shims distintos sobre `libra-ui`. Con la
// definición repetida en cada uno, alcanza con tocar una para que las dos
// pantallas dejen de coincidir, que es el tipo de divergencia que nadie reporta
// porque nunca se ven juntas.
//
// 🟡 **LibraInmo todavía no tiene identidad en el kit.** Los otros productos pasan
// `producto="libraclub"` y similares: `libra-ui/identidad` (ADR-033) es la ÚNICA tabla
// de colores e íconos de marca de la familia y hoy no conoce a LibraInmo. Inventar acá
// un color sería abrir una segunda tabla, así que el producto usa los tokens neutros
// del tema y una marca propia sencilla (`/favicon.svg`: una casa sobre grafito) hasta
// que se la agregue en el kit — pendiente en `TASKS.md`. Cuando esté, se cambia `LOGO`
// por `producto: 'librainmo'` en `Layout.tsx` y `Login.tsx` y se llama a
// `aplicarIdentidad('librainmo')` en `main.tsx`.

/** Cómo se escribe el producto. Una sola vez: el título de la pestaña, el login y la sidebar. */
export const PRODUCTO = 'LibraInmo'

/** La marca del producto: la que ya sirve `public/favicon.svg`. */
export const LOGO = { src: '/favicon.svg', alt: PRODUCTO } as const

/**
 * Cómo se escribe «LibraInmo» al lado del logo: Montserrat Bold `#2d2d2d`.
 *
 * Es el estándar de la familia y no una elección de este producto — todos lo
 * escriben igual, y el color no es el de la marca sino el gris del wordmark.
 *
 * 🔴 El tamaño NO va acá: lo pone cada superficie (22 px en el login, 15 px en
 * la sidebar), y el interlineado va pegado al tamaño.
 */
export const WORDMARK = 'font-montserrat font-bold text-[#2d2d2d] dark:text-neutral-100'
