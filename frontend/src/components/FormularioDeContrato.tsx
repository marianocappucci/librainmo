/**
 * El formulario de un contrato de locación: el alta (`ContratoNuevo`) y la edición de un borrador (`ContratoEditar`).
 *
 * 🔑 **El método de ajuste decide qué se pide** (`ContratoEntrada`, y las reglas de `app/servicios/contratos.py::_validar`): «sin ajuste» no
 * lleva índice ni porcentaje (el servidor lo rechaza si vienen), «porcentaje» pide el porcentaje y cada cuánto, e «índice» pide cuál y cada
 * cuánto. Lo que no corresponde al método elegido no se muestra, no se exige y viaja como `null`.
 *
 * 🔴 **Los importes y porcentajes se escriben como los escribe una persona** (`450.000,50`) y viajan como texto decimal (`"450000.50"`),
 * nunca como `number` (`lib/importes.ts`).
 *
 * El inquilino es `SelectCliente` con alta en el lugar (ADR-071); la propiedad, un `SelectBuscable` de las propiedades de la API.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { SelectCliente } from 'libra-ui/SelectCliente'
import type { OpcionSelect } from 'libra-ui/SelectBuscable'
import { CAMPOS_CLIENTE_DEL_MOTOR } from 'libra-ui/comercio/alta-de-cliente'

import { CampoBuscable, CampoCerrado, CampoDeTexto, CampoDeTextoLargo } from '@/components/campos'
import { AvisoDeError } from '@/components/listado'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useClientes } from '@/hooks/use-clientes'
import { useIndices } from '@/hooks/use-indices'
import { contratos, mensajeDeError, propiedades } from '@/lib/api'
import type { ContratoDetalle, ContratoEntrada, Propiedad } from '@/lib/api'
import {
  BASES_DE_PUNITORIO, DESTINOS_DE_PUNITORIO, ESTADOS_DE_PROPIEDAD, ESTADOS_SIN_CONTRATO, METODOS_DE_AJUSTE,
  METODO_FIJO, METODO_INDICE, METODO_PORCENTAJE, MONEDAS, PERIODICIDADES, direccionCompleta, etiquetaDe,
} from '@/lib/dominio'
import { aCentesimas, aDecimal, numeroArgentino } from '@/lib/importes'

// Las columnas del backend: `Numeric(14, 2)` admite 12 enteros; `Numeric(7, 3)`, 4; `Numeric(7, 4)`, 3.
const IMPORTE = { escala: 2, enteros: 12 }
const PORCENTAJE_DE_AJUSTE = { escala: 3, enteros: 4, miles: false }
const TASA_DE_PUNITORIO = { escala: 4, enteros: 3, miles: false }
const COMISION = { escala: 2, enteros: 3, miles: false }

const esquema = z
  .object({
    propiedad_id: z.string().min(1, 'Elegí la propiedad.'),
    inquilino_id: z.string().min(1, 'Elegí el inquilino.'),
    fecha_inicio: z.string().min(1, 'La fecha de inicio es obligatoria.'),
    fecha_fin: z.string().min(1, 'La fecha de fin es obligatoria.'),
    importe_inicial: z.string().trim().min(1, 'El alquiler inicial es obligatorio.'),
    moneda: z.string().min(1),
    dia_vencimiento: z.string().trim().min(1, 'El día de vencimiento es obligatorio.'),
    dias_gracia: z.string().trim(),
    metodo_ajuste: z.string().min(1),
    indice_ajuste: z.string(),
    porcentaje_ajuste: z.string().trim(),
    periodicidad_ajuste: z.string(),
    punitorio_tasa: z.string().trim(),
    punitorio_base: z.string().min(1),
    punitorio_para: z.string().min(1),
    comision_pct: z.string().trim().min(1, 'La comisión es obligatoria (0 si no cobra).'),
    deposito: z.string().trim(),
    observaciones: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    const error = (path: keyof Valores, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

    if (v.fecha_inicio && v.fecha_fin && v.fecha_fin < v.fecha_inicio) {
      error('fecha_fin', 'La fecha de fin no puede ser anterior a la de inicio.')
    }

    const importe = v.importe_inicial ? aDecimal(v.importe_inicial, IMPORTE.escala, IMPORTE) : null
    if (v.importe_inicial && (importe === null || aCentesimas(importe) === 0)) {
      error('importe_inicial', 'Escribí un importe mayor que cero, con hasta dos decimales (por ejemplo 450.000,00).')
    }

    if (v.dia_vencimiento && !(/^\d+$/.test(v.dia_vencimiento) && +v.dia_vencimiento >= 1 && +v.dia_vencimiento <= 31)) {
      error('dia_vencimiento', 'El día de vencimiento va del 1 al 31.')
    }
    if (v.dias_gracia && !/^\d+$/.test(v.dias_gracia)) error('dias_gracia', 'Los días de gracia son un número entero, 0 o más.')

    if (v.metodo_ajuste === METODO_INDICE && !v.indice_ajuste) error('indice_ajuste', 'Elegí el índice.')
    if (v.metodo_ajuste !== METODO_FIJO && !v.periodicidad_ajuste) error('periodicidad_ajuste', 'Elegí cada cuánto se ajusta.')
    if (v.metodo_ajuste === METODO_PORCENTAJE) {
      const p = aDecimal(v.porcentaje_ajuste, PORCENTAJE_DE_AJUSTE.escala, PORCENTAJE_DE_AJUSTE)
      if (p === null || +p === 0) error('porcentaje_ajuste', 'Escribí el porcentaje de cada ajuste, mayor que cero (hasta tres decimales).')
    }

    if (v.punitorio_tasa && aDecimal(v.punitorio_tasa, TASA_DE_PUNITORIO.escala, TASA_DE_PUNITORIO) === null) {
      error('punitorio_tasa', 'Escribí la tasa en porcentaje, con hasta cuatro decimales (0,5 es medio por ciento).')
    }

    const comision = v.comision_pct ? aDecimal(v.comision_pct, COMISION.escala, COMISION) : null
    if (v.comision_pct && (comision === null || (aCentesimas(comision) ?? 0) > 10000)) {
      error('comision_pct', 'La comisión va de 0 a 100 %.')
    }

    if (v.deposito && aDecimal(v.deposito, IMPORTE.escala, IMPORTE) === null) {
      error('deposito', 'Escribí el depósito con hasta dos decimales (por ejemplo 450.000,00).')
    }
  })

type Valores = z.infer<typeof esquema>

const VACIO: Valores = {
  propiedad_id: '',
  inquilino_id: '',
  fecha_inicio: '',
  fecha_fin: '',
  importe_inicial: '',
  moneda: 'ARS',
  dia_vencimiento: '10',
  dias_gracia: '0',
  metodo_ajuste: METODO_FIJO,
  indice_ajuste: '',
  porcentaje_ajuste: '',
  periodicidad_ajuste: '',
  punitorio_tasa: '',
  punitorio_base: 'diaria',
  punitorio_para: 'inmobiliaria',
  comision_pct: '0',
  deposito: '',
  observaciones: '',
}

function desdeContrato(c: ContratoDetalle): Valores {
  return {
    propiedad_id: String(c.propiedad_id),
    inquilino_id: String(c.inquilino_id),
    fecha_inicio: c.fecha_inicio,
    fecha_fin: c.fecha_fin,
    importe_inicial: numeroArgentino(c.importe_vigente, 2),
    moneda: c.moneda,
    dia_vencimiento: String(c.dia_vencimiento),
    dias_gracia: String(c.dias_gracia),
    metodo_ajuste: c.metodo_ajuste,
    indice_ajuste: c.indice_ajuste ?? '',
    porcentaje_ajuste: numeroArgentino(c.porcentaje_ajuste, 2),
    periodicidad_ajuste: c.periodicidad_ajuste ?? '',
    punitorio_tasa: numeroArgentino(c.punitorio_tasa, 2),
    punitorio_base: c.punitorio_base,
    punitorio_para: c.punitorio_para,
    comision_pct: numeroArgentino(c.comision_pct, 2),
    deposito: numeroArgentino(c.deposito, 2),
    observaciones: c.observaciones ?? '',
  }
}

/** Lo que se manda, con lo que no corresponde al método de ajuste en `null` y los importes como texto decimal. Pura. */
function aEntradaDeContrato(v: Valores): ContratoEntrada {
  const decimal = (t: string, opciones: { escala: number; enteros: number; miles?: boolean }) =>
    t ? aDecimal(t, opciones.escala, opciones) : null
  return {
    propiedad_id: Number(v.propiedad_id),
    inquilino_id: Number(v.inquilino_id),
    fecha_inicio: v.fecha_inicio,
    fecha_fin: v.fecha_fin,
    importe_inicial: decimal(v.importe_inicial, IMPORTE) ?? '',
    moneda: v.moneda,
    dia_vencimiento: Number(v.dia_vencimiento),
    dias_gracia: Number(v.dias_gracia || '0'),
    metodo_ajuste: v.metodo_ajuste,
    indice_ajuste: v.metodo_ajuste === METODO_INDICE ? v.indice_ajuste : null,
    porcentaje_ajuste: v.metodo_ajuste === METODO_PORCENTAJE ? decimal(v.porcentaje_ajuste, PORCENTAJE_DE_AJUSTE) : null,
    periodicidad_ajuste: v.metodo_ajuste === METODO_FIJO ? null : v.periodicidad_ajuste,
    punitorio_tasa: decimal(v.punitorio_tasa, TASA_DE_PUNITORIO),
    punitorio_base: v.punitorio_base,
    punitorio_para: v.punitorio_para,
    comision_pct: decimal(v.comision_pct, COMISION) ?? '0.00',
    deposito: decimal(v.deposito, IMPORTE),
    observaciones: v.observaciones.trim() || null,
  }
}

function opcionDePropiedad(p: Propiedad): OpcionSelect {
  return {
    value: String(p.id),
    label: `${p.codigo} · ${direccionCompleta(p)}`,
    hint: etiquetaDe(ESTADOS_DE_PROPIEDAD, p.estado),
    // Vendida o de baja: se ve pero no se elige (el servidor no deja activar un contrato ahí).
    disabled: ESTADOS_SIN_CONTRATO.includes(p.estado),
  }
}

export function FormularioDeContrato({ contrato, propiedadInicial, onCancelar }: {
  /** El borrador a editar; `undefined` = alta. */
  contrato?: ContratoDetalle
  /** La propiedad con la que arranca un alta (viene de la ficha de la propiedad). */
  propiedadInicial?: string
  onCancelar: () => void
}) {
  const navigate = useNavigate()
  const { opciones: clientesDeLaApi, crear, error: errorDeClientes } = useClientes()
  const { opciones: indicesDeLaApi, error: errorDeIndices } = useIndices()
  const [lista, setLista] = useState<Propiedad[]>([])
  const [error, setError] = useState<string | null>(null)

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: contrato ? desdeContrato(contrato) : { ...VACIO, propiedad_id: propiedadInicial ?? '' },
  })
  const metodo = form.watch('metodo_ajuste')

  useEffect(() => {
    propiedades.listar().then(setLista).catch((e: unknown) => setError(mensajeDeError(e)))
  }, [])

  // Al editar, el inquilino y la propiedad ya elegidos se ven con su nombre desde el primer cuadro, antes de que lleguen las listas.
  const clientes = useMemo(() => {
    if (!contrato || clientesDeLaApi.some((o) => o.value === String(contrato.inquilino_id))) return clientesDeLaApi
    return [...clientesDeLaApi, { value: String(contrato.inquilino_id), label: contrato.inquilino_nombre }]
  }, [clientesDeLaApi, contrato])
  // Al editar, el índice ya elegido se ve con su nombre aunque el catálogo todavía no haya llegado.
  const indices = useMemo(() => {
    if (!contrato?.indice_ajuste || indicesDeLaApi.some((o) => o.value === contrato.indice_ajuste)) return indicesDeLaApi
    return [...indicesDeLaApi, { value: contrato.indice_ajuste, label: contrato.indice_ajuste_nombre ?? contrato.indice_ajuste }]
  }, [indicesDeLaApi, contrato])
  const opcionesDePropiedades = useMemo(() => {
    const opciones = lista.map(opcionDePropiedad)
    if (!contrato || opciones.some((o) => o.value === String(contrato.propiedad_id))) return opciones
    return [
      ...opciones,
      { value: String(contrato.propiedad_id), label: `${contrato.propiedad_codigo} · ${contrato.propiedad_direccion}` },
    ]
  }, [lista, contrato])

  async function enviar(valores: Valores) {
    setError(null)
    try {
      const entrada = aEntradaDeContrato(valores)
      const guardado = contrato ? await contratos.editar(contrato.id, entrada) : await contratos.crear(entrada)
      navigate(`/contratos/${guardado.id}`)
    } catch (err) {
      // 404/409/422: el servidor dice cuál (propiedad inexistente, borrador que ya no lo es…).
      setError(mensajeDeError(err))
    }
  }

  const enviando = form.formState.isSubmitting

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(enviar)} className="space-y-4" noValidate>
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Propiedad e inquilino</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoBuscable
              control={form.control}
              name="propiedad_id"
              etiqueta="Propiedad"
              opciones={opcionesDePropiedades}
              placeholder="Buscar por código o dirección…"
            />
            <FormField
              control={form.control}
              name="inquilino_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inquilino</FormLabel>
                  <FormControl>
                    {/* El alta en el lugar (ADR-071): el campo del inquilino es siempre SelectCliente. */}
                    <SelectCliente
                      value={field.value}
                      onChange={field.onChange}
                      opciones={clientes}
                      placeholder="Buscar inquilino…"
                      ariaLabel="Inquilino"
                      entidad="inquilino"
                      campos={CAMPOS_CLIENTE_DEL_MOTOR}
                      crear={crear}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Plazo y alquiler</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CampoDeTexto control={form.control} name="fecha_inicio" etiqueta="Fecha de inicio" type="date" />
            <CampoDeTexto control={form.control} name="fecha_fin" etiqueta="Fecha de fin" type="date" />
            <CampoDeTexto
              control={form.control}
              name="importe_inicial"
              etiqueta="Alquiler inicial"
              inputMode="decimal"
              placeholder="450.000,00"
              autoComplete="off"
            />
            <CampoCerrado control={form.control} name="moneda" etiqueta="Moneda" opciones={MONEDAS} />
            <CampoDeTexto control={form.control} name="dia_vencimiento" etiqueta="Día de vencimiento" inputMode="numeric" autoComplete="off" />
            <CampoDeTexto control={form.control} name="dias_gracia" etiqueta="Días de gracia" inputMode="numeric" autoComplete="off" />
            <CampoDeTexto
              control={form.control}
              name="deposito"
              etiqueta="Depósito"
              inputMode="decimal"
              placeholder="Opcional"
              autoComplete="off"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Ajuste del alquiler</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <CampoCerrado control={form.control} name="metodo_ajuste" etiqueta="Método de ajuste" opciones={METODOS_DE_AJUSTE} />
            {metodo === METODO_INDICE && (
              <CampoBuscable
                control={form.control}
                name="indice_ajuste"
                etiqueta="Índice"
                opciones={indices}
                placeholder="Buscar índice…"
              />
            )}
            {metodo === METODO_PORCENTAJE && (
              <CampoDeTexto
                control={form.control}
                name="porcentaje_ajuste"
                etiqueta="Porcentaje de cada ajuste"
                inputMode="decimal"
                placeholder="10,00"
                autoComplete="off"
              />
            )}
            {metodo !== METODO_FIJO && (
              <CampoCerrado
                control={form.control}
                name="periodicidad_ajuste"
                etiqueta="Se ajusta cada"
                opciones={PERIODICIDADES}
                placeholder="Elegir…"
              />
            )}
          </div>
          {metodo === METODO_FIJO && (
            <p className="text-sm text-muted-foreground">El alquiler no se ajusta: se mantiene en el importe inicial.</p>
          )}
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Mora y comisión</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CampoDeTexto
              control={form.control}
              name="punitorio_tasa"
              etiqueta="Punitorio (tasa en %)"
              inputMode="decimal"
              placeholder="Sin punitorio"
              autoComplete="off"
            />
            <CampoCerrado control={form.control} name="punitorio_base" etiqueta="La tasa es" opciones={BASES_DE_PUNITORIO} />
            <CampoCerrado control={form.control} name="punitorio_para" etiqueta="El punitorio es para" opciones={DESTINOS_DE_PUNITORIO} />
            <CampoDeTexto
              control={form.control}
              name="comision_pct"
              etiqueta="Comisión (%)"
              inputMode="decimal"
              placeholder="0,00"
              autoComplete="off"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Observaciones</h3>
          <CampoDeTextoLargo control={form.control} name="observaciones" etiqueta="Observaciones" />
        </section>

        <AvisoDeError mensaje={error ?? errorDeClientes ?? errorDeIndices} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : contrato ? 'Guardar cambios' : 'Crear contrato'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
