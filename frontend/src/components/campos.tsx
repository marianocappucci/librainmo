/**
 * Los campos de formulario de la app: la etiqueta, el control y el mensaje de validación, ya cableados a React Hook Form con el
 * `Form*` de shadcn.
 *
 * Existen para que cada formulario (propiedad, contrato, garantía, concepto) no repita seis líneas de
 * `FormField/FormItem/FormLabel/FormControl/FormMessage` por campo. El `FormControl` es el que le pasa `id`, `aria-invalid` y
 * `aria-describedby` al control: por eso el select cerrado y `SelectBuscable` declaran esas props.
 */
import type { ComponentProps, ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { SelectBuscable, type OpcionSelect } from 'libra-ui/SelectBuscable'

import { SelectCerrado, type OpcionCerrada } from '@/components/SelectCerrado'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Comun<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  etiqueta: string
  className?: string
  /** Una línea de ayuda debajo del control. */
  ayuda?: ReactNode
}

export function CampoDeTexto<T extends FieldValues>({
  control, name, etiqueta, className, ayuda, ...resto
}: Comun<T> & Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'onBlur' | 'ref' | 'className'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{etiqueta}</FormLabel>
          <FormControl>
            <Input {...resto} {...field} value={field.value ?? ''} />
          </FormControl>
          {ayuda && <FormDescription>{ayuda}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function CampoDeTextoLargo<T extends FieldValues>({
  control, name, etiqueta, className, ayuda, ...resto
}: Comun<T> & Omit<ComponentProps<typeof Textarea>, 'name' | 'value' | 'onChange' | 'onBlur' | 'ref' | 'className'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{etiqueta}</FormLabel>
          <FormControl>
            <Textarea rows={3} {...resto} {...field} value={field.value ?? ''} />
          </FormControl>
          {ayuda && <FormDescription>{ayuda}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/** Un desplegable de lista cerrada (tipo, estado, moneda…): ver `SelectCerrado`. */
export function CampoCerrado<T extends FieldValues>({
  control, name, etiqueta, className, ayuda, opciones, placeholder, disabled,
}: Comun<T> & { opciones: readonly OpcionCerrada[]; placeholder?: string; disabled?: boolean }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{etiqueta}</FormLabel>
          <FormControl>
            <SelectCerrado
              value={field.value ?? ''}
              onChange={field.onChange}
              opciones={opciones}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full"
            />
          </FormControl>
          {ayuda && <FormDescription>{ayuda}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/** Un desplegable de datos (las propiedades), que se busca escribiendo. */
export function CampoBuscable<T extends FieldValues>({
  control, name, etiqueta, className, ayuda, opciones, placeholder, disabled,
}: Comun<T> & { opciones: OpcionSelect[]; placeholder?: string; disabled?: boolean }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{etiqueta}</FormLabel>
          <FormControl>
            <SelectBuscable
              value={field.value ?? ''}
              onChange={field.onChange}
              opciones={opciones}
              placeholder={placeholder}
              ariaLabel={etiqueta}
              disabled={disabled}
            />
          </FormControl>
          {ayuda && <FormDescription>{ayuda}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
