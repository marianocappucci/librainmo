# Roadmap — LibraInmo

Dirección del producto. El diseño completo (qué ya existe en la familia, reparto motor y producto,
cuenta corriente asiento por asiento, índices y su fuente) está en la página
`inmobiliaria-administracion-alquileres-diseno` del wiki.

## Objetivo actual

- [x] **Esqueleto** — app que arranca, migra las tres cadenas, login, usuarios y actividad.
- [ ] **Fase 1 — MVP del piloto (NA Propiedades)**: modelo inmobiliario sobre el motor.

## Fases

| Fase | Qué entrega | Terminada cuando |
|---|---|---|
| Esqueleto | FastAPI, `libraauth`, `libracore` en la misma base, Postgres + Alembic, login, usuarios `admin` y `operador`, SPA con `libra-ui`, tests y CI | La suite corre contra Postgres, la app arranca y el login anda ✅ |
| Fase 0 — Motor (`libracore`) | `indices_ajuste` (la tabla ya está en `v1.196.1`) con carga manual y descarga del ICL y del IPC, cálculo del ajuste puro y con tests de tabla, aritmética de períodos y devengado subida desde LibraDesk, punitorios | Tag anotado de `libracore`; los consumidores suben el pin cuando adopten |
| Fase 1 — MVP del piloto | Propiedades, titulares, contratos y garantías; devengado mensual con previsualización y confirmación; ajuste automático y aviso del aumento; cobro con recibo, punitorios y cuenta del inquilino; gastos por cuenta del propietario; liquidación al propietario con PDF y transferencia registrada; comisión a la bandeja de comprobantes y factura ARCA; reporte de fondos de terceros; importación de los contratos vivos | NA Propiedades administra un mes completo sin planilla |
| Fase 2 — Comunicación y cobro | Aviso de pago y liquidación por correo (WhatsApp después); link o QR de Mercado Pago con conciliación; acceso del propietario a sus liquidaciones y del inquilino a su cuenta; vencimientos de contrato y de garantías, renovaciones | — |
| Fase 3 — Comercial | Cartera de propiedades en venta y en alquiler, interesados, visitas y tasaciones; reservas con seña que entran a la cuenta del interesado; publicación en el sitio del cliente y, más adelante, en los portales | — |

Sin fecha hasta relevar al piloto: cuántos contratos tiene, qué índices usa y desde qué datos se importa definen más que el código (ver «Qué hay que relevar con NA Propiedades» en la página de diseño).
