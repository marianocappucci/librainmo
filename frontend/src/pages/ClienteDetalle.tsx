// La ficha del cliente: la pantalla del kit (`libra-ui/comercio/ClienteDetalle`), sobre `GET/PUT /api/clientes/:id` del motor.
//
// Variantes de LibraInmo: no tiene facturación ni presupuestos ni remitos propios (`conComprobantes={false}`: sin el resumen ni las tablas de
// comprobantes, que apuntan a `/facturas`, `/presupuestos` y `/remitos`, rutas que acá no existen), ni la bandeja de MercadoPago
// (`conMercadoPago={false}`: sin el auto-facturar ni los alias de facturación), ni el padrón de ARCA (`conConsultaCuit={false}`).
//
// Desde libra-ui v0.182.1 el diálogo «Editar» también respeta `conMercadoPago` (antes mostraba igual la facturación automática).
import { ClienteDetalle as ClienteDetalleComercio } from 'libra-ui/comercio/ClienteDetalle'

export function ClienteDetalle() {
  return <ClienteDetalleComercio conMercadoPago={false} conComprobantes={false} conConsultaCuit={false} />
}
