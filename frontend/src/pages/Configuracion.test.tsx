import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Configuracion } from './Configuracion'
import { error, json, servidor } from '@/test/servidor'

/**
 * La pantalla es la de la familia (`libra-ui/Configuracion`); lo propio de LibraInmo es QUÉ declara: sólo Empresa y Datos / Backup, que son
 * los routers que el backend monta (`build_empresa_router`, `build_empresa_admin_router`, `build_backup_router`). Nada de MercadoPago, ARCA
 * ni correo: una pestaña sin endpoints daría 404 en cada carga. Vale además como canario del kit.
 */

const EMPRESA = {
  empresa_nombre: 'Inmobiliaria Ficticia', empresa_direccion: 'Calle Inventada 123', empresa_cuit: '30000000019',
  empresa_telefono: '1155550000', empresa_email: 'info@ficticia.test', empresa_iibb: '', empresa_iva_condition: 'Responsable Inscripto',
  empresa_inicio_actividades: '2020-01-01',
}

function montar(ruta = '/configuracion') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Configuracion />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Configuración', () => {
  it('ofrece Empresa y Datos / Backup, y ninguna integración que el backend no monta', async () => {
    const api = servidor({
      'GET /api/config/empresa': json(EMPRESA),
      'GET /api/config/empresa/logo': error(404, 'No hay logo cargado.'),
    })
    montar()

    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Empresa' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Datos / Backup' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Integraciones' })).not.toBeInTheDocument()
    expect(screen.queryByText(/MercadoPago|ARCA|SMTP/)).not.toBeInTheDocument()

    // Empresa es la primera pestaña: carga los datos de `GET /api/config/empresa`.
    expect(await screen.findByDisplayValue('Inmobiliaria Ficticia')).toBeInTheDocument()
    expect(api.de('GET', '/api/config/empresa')).toHaveLength(1)
    // Nada de rutas de integraciones inexistentes.
    expect(api.pedidos.filter((p) => !p.ruta.startsWith('/api/config/empresa'))).toEqual([])
  })

  it('guardar los datos de la empresa llama a `PUT /api/config/empresa` con los campos corregidos', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/config/empresa': json(EMPRESA),
      'GET /api/config/empresa/logo': error(404, 'No hay logo cargado.'),
      'PUT /api/config/empresa': json({ ...EMPRESA, empresa_nombre: 'Inmobiliaria Corregida' }),
    })
    montar()

    const nombre = await screen.findByDisplayValue('Inmobiliaria Ficticia')
    await user.clear(nombre)
    await user.type(nombre, 'Inmobiliaria Corregida')
    await user.click(screen.getByRole('button', { name: /Guardar datos de empresa/ }))

    await waitFor(() => expect(api.de('PUT', '/api/config/empresa')).toHaveLength(1))
    expect(api.de('PUT', '/api/config/empresa')[0].cuerpo).toMatchObject({
      empresa_nombre: 'Inmobiliaria Corregida', empresa_cuit: '30000000019', empresa_iva_condition: 'Responsable Inscripto',
    })
  })

  it('Datos / Backup lista las copias de `GET /api/config/backups` y la descarga va a `/api/config/backup-ahora`', async () => {
    const user = userEvent.setup()
    const api = servidor({
      'GET /api/config/backups': json([{ filename: 'librainmo-2026-10-26.zip', size_mb: 1.5, mtime: '2026-10-26T03:00:00' }]),
      'POST /api/config/backups': json({ filename: 'librainmo-2026-10-27.zip' }),
    })
    montar('/configuracion?seccion=datos')

    expect(await screen.findByText('librainmo-2026-10-26.zip')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar copia ahora/ })).toHaveAttribute('href', '/api/config/backup-ahora')
    expect(screen.getByRole('link', { name: /Descargar$/ })).toHaveAttribute('href', '/api/config/backups/librainmo-2026-10-26.zip')
    // El botón fijo de la barra («Backup rápido») baja la misma copia sin entrar a la pestaña.
    expect(screen.getByRole('link', { name: /Backup rápido/ })).toHaveAttribute('href', '/api/config/backup-ahora')

    await user.click(screen.getByRole('button', { name: 'Guardar copia en el servidor' }))
    await waitFor(() => expect(api.de('POST', '/api/config/backups')).toHaveLength(1))
    // El restore se ofrece pero nada lo dispara sin elegir un archivo (reemplaza TODOS los datos).
    expect(api.de('POST', '/api/config/restore')).toHaveLength(0)
  })

  it('cambiar de pestaña va a la sección pedida por la URL', async () => {
    const user = userEvent.setup()
    servidor({
      'GET /api/config/empresa': json(EMPRESA),
      'GET /api/config/empresa/logo': error(404, 'No hay logo cargado.'),
      'GET /api/config/backups': json([]),
    })
    montar()
    await screen.findByDisplayValue('Inmobiliaria Ficticia')

    await user.click(screen.getByRole('tab', { name: 'Datos / Backup' }))
    expect(await screen.findByText('Restaurar base de datos')).toBeInTheDocument()
    expect(screen.getByLabelText('Archivo de backup (.zip)')).toBeInTheDocument()
    // La pestaña activa pasa a ser Datos / Backup.
    expect(screen.getByRole('tab', { name: 'Datos / Backup' })).toHaveAttribute('data-state', 'active')
  })
})
