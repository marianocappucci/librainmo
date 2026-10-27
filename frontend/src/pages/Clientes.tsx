// Clientes: la pantalla del kit (`libra-ui/comercio/Clientes`), la misma que montan Contalibra y VentaLibra, sobre el router del motor
// (`build_clientes_router`, `/api/clientes`, ADR-002 y ADR-004).
//
// En una inmobiliaria el «cliente» es el inquilino, el propietario o el garante: todos son filas de `clients` del motor. Hasta ahora sólo
// se daban de alta en el lugar, con `SelectCliente`; esta pantalla es donde se corrige el nombre o el CUIT de alguien ya cargado, y donde
// se da de baja o se reactiva.
//
// Variante de LibraInmo: `conConsultaCuit={false}`. El producto no monta `/api/consultar-cuit` (no tiene ARCA todavía), así que el botón
// «Consultar en ARCA» daría un error en cada click. Cuando se monte el router del padrón, se saca la prop.
import { Clientes as ClientesComercio } from 'libra-ui/comercio/Clientes'

export function Clientes() {
  return <ClientesComercio conConsultaCuit={false} />
}
