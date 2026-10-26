import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CobrarCuota } from './CobrarCuota'
import { COBRO, COBRO_CON_PUNITORIO, COBRO_EN_TERMINO, CUOTA_PENDIENTE } from '@/test/datos'
import { error, json, servidor } from '@/test/servidor'
import { hoyISO } from '@/lib/fechas'

type Usuario = ReturnType<typeof userEvent.setup>

function montar() {
  return render(
    <MemoryRouter initialEntries={['/cuotas/30/cobrar']}>
      <Routes>
        <Route path="/cuotas/:id/cobrar" element={<CobrarCuota />} />
        <Route path="/cuotas/:id" element={<p>FICHA DE LA CUOTA</p>} />
        <Route path="/cuotas" element={<p>LISTA DE CUOTAS</p>} />
        <Route path="/cobros/:id" element={<p>FICHA DEL COBRO</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function base() {
  return servidor({
    'GET /api/cuotas/30': json(CUOTA_PENDIENTE),
    // El punitorio depende de la fecha: el día 14 ya pasó el vencimiento (10); los demás, en término.
    'GET /api/cuotas/30/cobro': (p) => {
      const fecha = p.query.get('fecha') ?? ''
      return json(fecha === '2026-11-14' ? COBRO_CON_PUNITORIO : { ...COBRO_EN_TERMINO, fecha })
    },
    'POST /api/cuotas/30/cobrar': json(COBRO, 201),
  })
}

const fijarFecha = (valor: string) => fireEvent.change(screen.getByLabelText('Fecha del cobro'), { target: { value: valor } })
const registrar = () => screen.getByRole('button', { name: 'Registrar el cobro' })

async function conFecha(valor: string) {
  await screen.findByLabelText('Fecha del cobro')
  fijarFecha(valor)
  await screen.findByText(/Total a cobrar/)
}

async function escribirMonto(user: Usuario, n: number, valor: string) {
  const campo = screen.getByLabelText(`Monto ${n}`)
  await user.clear(campo)
  await user.type(campo, valor)
}

afterEach(() => vi.unstubAllGlobals())

describe('Cobrar una cuota — cuánto se cobra', () => {
  it('arranca con la fecha de hoy y le pide al servidor el cobro de ese día', async () => {
    const api = base()
    montar()
    expect(await screen.findByLabelText('Fecha del cobro')).toHaveValue(hoyISO())
    await waitFor(() => expect(api.de('GET', '/api/cuotas/30/cobro')).toHaveLength(1))
    expect(api.de('GET', '/api/cuotas/30/cobro')[0].query.get('fecha')).toBe(hoyISO())
  })

  it('🔴 el punitorio lo calcula el servidor y se vuelve a pedir cuando cambia la fecha: en término, cero; vencida, con sus días de atraso y el total', async () => {
    const api = base()
    montar()
    await conFecha('2026-11-08')
    expect(screen.getByText('Total a cobrar').nextSibling).toHaveTextContent('$ 462.500,50')
    expect(screen.queryByRole('checkbox', { name: 'Condonar el punitorio' })).not.toBeInTheDocument()

    fijarFecha('2026-11-14')
    expect(await screen.findByText('4 días de atraso', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Punitorio').nextSibling).toHaveTextContent('$ 9.250,01')
    expect(screen.getByText('Total a cobrar').nextSibling).toHaveTextContent('$ 471.750,51')
    expect(api.de('GET', '/api/cuotas/30/cobro').at(-1)?.query.get('fecha')).toBe('2026-11-14')
  })

  it('🔴 «condonar» saca el punitorio del total (queda tachado) y es lo que viaja', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await conFecha('2026-11-14')

    await user.click(await screen.findByRole('checkbox', { name: 'Condonar el punitorio' }))
    expect(screen.getByText('Total a cobrar').nextSibling).toHaveTextContent('$ 462.500,50')
    expect(screen.getByText(/El punitorio es para la inmobiliaria/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Monto 1')).toHaveValue('462.500,50'))
    await user.click(registrar())

    await waitFor(() => expect(api.de('POST', '/api/cuotas/30/cobrar')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/30/cobrar')[0].cuerpo).toMatchObject({ condonar_punitorio: true, medios: [{ monto: '462500.50' }] })
  })

  it('🔴 una fecha anterior a la emisión de la cuota se avisa y no deja cobrar', async () => {
    base()
    montar()
    await conFecha('2026-10-20')
    expect(screen.getByRole('alert')).toHaveTextContent('No se cobra una cuota antes de emitirla (01-11-2026).')
    expect(registrar()).toBeDisabled()
  })

  it('una cuota que ya no está pendiente (409 al pedir el cobro) lo dice y no deja cobrar', async () => {
    const api = base()
    api.responder('GET /api/cuotas/30/cobro', error(409, 'La cuota está cobrada.'))
    montar()
    expect(await screen.findByText('La cuota está cobrada.')).toBeInTheDocument()
    expect(registrar()).toBeDisabled()
  })
})

describe('Cobrar una cuota — los medios de pago', () => {
  it('ofrece los ocho medios del motor y ninguno es «cuenta corriente»', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await conFecha('2026-11-08')
    await user.click(screen.getByRole('combobox', { name: 'Medio de pago 1' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Efectivo', 'Transferencia', 'Tarjeta de débito', 'Tarjeta de crédito', 'Mercado Pago', 'Cuenta DNI', 'Otras billeteras', 'Cheque',
    ])
  })

  it('🔴 con un solo medio sin tocar, el monto sigue al total; manda el cobro con los importes como texto decimal', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await conFecha('2026-11-14')
    await waitFor(() => expect(screen.getByLabelText('Monto 1')).toHaveValue('471.750,51'))
    expect(screen.getByText('Los medios cierran con el total.')).toBeInTheDocument()

    await user.click(registrar())
    await waitFor(() => expect(api.de('POST', '/api/cuotas/30/cobrar')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/30/cobrar')[0].cuerpo).toEqual({
      fecha: '2026-11-14',
      condonar_punitorio: false,
      medios: [{ medio_pago: 'efectivo', referencia: null, monto: '471750.51' }],
    })
  })

  it('🔴 con varios medios, el botón se habilita sólo cuando suman el total al centavo, y dice cuánto falta o cuánto se pasa', async () => {
    const user = userEvent.setup()
    const api = base()
    montar()
    await conFecha('2026-11-14')
    await waitFor(() => expect(screen.getByLabelText('Monto 1')).toHaveValue('471.750,51'))

    await user.click(screen.getByRole('button', { name: 'Agregar otro medio' }))
    // Los dos medios: el primero con el total, el segundo vacío.
    await escribirMonto(user, 1, '400000')
    expect(screen.getByText('Escribí el monto de cada medio, con hasta dos decimales.')).toBeInTheDocument()
    expect(registrar()).toBeDisabled()

    await escribirMonto(user, 2, '70000')
    expect(screen.getByText('Falta cobrar $ 1.750,51.')).toBeInTheDocument()
    expect(registrar()).toBeDisabled()

    await escribirMonto(user, 2, '80000')
    expect(screen.getByText('Los medios se pasan del total por $ 8.249,49.')).toBeInTheDocument()
    expect(registrar()).toBeDisabled()

    await escribirMonto(user, 2, '71.750,51')
    expect(screen.getByText('Los medios cierran con el total.')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Medio de pago 2' }))
    await user.click(await screen.findByRole('option', { name: 'Transferencia' }))
    await user.type(screen.getByLabelText('Referencia 2'), '  OP-998877 ')
    expect(registrar()).toBeEnabled()
    await user.click(registrar())

    await waitFor(() => expect(api.de('POST', '/api/cuotas/30/cobrar')).toHaveLength(1))
    expect(api.de('POST', '/api/cuotas/30/cobrar')[0].cuerpo).toEqual({
      fecha: '2026-11-14',
      condonar_punitorio: false,
      medios: [
        { medio_pago: 'efectivo', referencia: null, monto: '400000.00' },
        { medio_pago: 'transferencia', referencia: 'OP-998877', monto: '71750.51' },
      ],
    })
  })

  it('un monto de cero o mal escrito no es válido', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await conFecha('2026-11-08')
    await escribirMonto(user, 1, '0')
    expect(registrar()).toBeDisabled()
    await escribirMonto(user, 1, 'abc')
    expect(registrar()).toBeDisabled()
  })

  it('se puede quitar un medio, salvo el último', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await conFecha('2026-11-08')
    expect(screen.getByRole('button', { name: 'Quitar medio 1' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Agregar otro medio' }))
    await user.click(screen.getByRole('button', { name: 'Quitar medio 2' }))
    expect(screen.queryByLabelText('Monto 2')).not.toBeInTheDocument()
  })
})

describe('Cobrar una cuota — el recibo', () => {
  it('🔴 después de cobrar muestra el recibo con su número y abre el PDF en otra pestaña, con enlaces para seguir', async () => {
    const user = userEvent.setup()
    base()
    montar()
    await conFecha('2026-11-14')
    await waitFor(() => expect(screen.getByLabelText('Monto 1')).toHaveValue('471.750,51'))
    await user.click(registrar())

    expect(await screen.findByText('Cobro de $ 471.750,51 el 14-11-2026')).toBeInTheDocument()
    expect(screen.getByText(/Recibo N° 00000012 \(punto de venta 1\)/)).toBeInTheDocument()
    const pdf = screen.getByRole('link', { name: /Abrir el recibo/ })
    expect(pdf).toHaveAttribute('href', '/api/cobros/40/recibo.pdf')
    expect(pdf).toHaveAttribute('target', '_blank')
    expect(pdf).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByRole('link', { name: 'Ver el cobro' })).toHaveAttribute('href', '/cobros/40')
    expect(screen.getByRole('link', { name: 'Volver a las cuotas' })).toHaveAttribute('href', '/cuotas')
  })

  it('un rechazo del servidor al cobrar (los medios no suman) se muestra y lo escrito queda', async () => {
    const user = userEvent.setup()
    const api = base()
    api.responder('POST /api/cuotas/30/cobrar', error(422, 'Los medios de pago suman 400000.00 y el cobro es de 462500.50.'))
    montar()
    await conFecha('2026-11-08')
    await user.click(registrar())

    expect(await screen.findByRole('alert')).toHaveTextContent('Los medios de pago suman 400000.00')
    expect(screen.getByLabelText('Monto 1')).toHaveValue('462.500,50')
  })
})
