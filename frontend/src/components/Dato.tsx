import type { ReactNode } from 'react'

/** Un dato rotulado de una ficha (`<dl>`): la etiqueta chica arriba y el valor abajo; sin valor, un guion. */
export function Dato({ etiqueta, children, className }: { etiqueta: string; children?: ReactNode; className?: string }) {
  return (
    <div className={className ? `grid content-start gap-0.5 ${className}` : 'grid content-start gap-0.5'}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children || '—'}</dd>
    </div>
  )
}
