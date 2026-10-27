// La identidad visual de LibraInmo: cómo se escribe el nombre y qué marca lleva.
//
// Vive en un archivo propio porque lo usan las DOS superficies que lo muestran
// —el login y la sidebar— y son shims distintos sobre `libra-ui`. Con la
// definición repetida en cada uno, alcanza con tocar una para que las dos
// pantallas dejen de coincidir, que es el tipo de divergencia que nadie reporta
// porque nunca se ven juntas.
//
// El color, la marca (casa y llave) y el fondo del login NO están acá: son de `libra-ui/identidad` (ADR-033, LibraInmo desde v0.182.0,
// ADR-096), la única tabla de la familia. Los pone `producto: 'librainmo'` en el login y la sidebar y `aplicarIdentidad('librainmo')` en
// `main.tsx`; `public/favicon.svg` es una copia de `marcas/librainmo-favicon.svg` del kit.

/** Cómo se escribe el producto. Una sola vez: el título de la pestaña, el login y la sidebar. */
export const PRODUCTO = 'LibraInmo'

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
