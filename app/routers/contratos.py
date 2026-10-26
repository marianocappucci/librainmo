"""Contratos de locación: alta, ciclo de vida, precio con vigencia, garantías y conceptos."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app import tiempo
from app.auth import get_current_user, require_rol
from app.db import obtener_sesion
from app.modulos import exigir_modulo
from app.roles import ROLES
from app.schemas.contratos import (
    ConceptoCambio,
    ConceptoEntrada,
    ContratoCambio,
    ContratoEntrada,
    GarantiaEntrada,
    PrecioEntrada,
    RescisionEntrada,
)
from app.schemas.cuotas import AjusteEntrada
from app.servicios import ajustes
from app.servicios import contratos as servicio

router = APIRouter(
    prefix="/api/contratos",
    tags=["contratos"],
    dependencies=[*exigir_modulo("alquileres"), Depends(require_rol(*ROLES))],
)


def _usuario(usuario: dict | None) -> str:
    """Quién hizo el cambio, para el historial de precios."""
    return (usuario or {}).get("username") or "Sistema"


@router.get("/ajustes/indices")
def indices_de_ajuste():
    """Los índices del motor (`libracore.indices_ajuste.INDICES`), para elegir el del contrato."""
    from libracore import indices_descarga
    from libracore.indices_ajuste import INDICES

    return [{"clave": i.clave, "nombre": i.nombre, "periodicidad": i.periodicidad,
             "se_baja_solo": i.clave in indices_descarga.DESCARGABLES} for i in INDICES.values()]


@router.get("")
def buscar(q: str | None = None, estado: str | None = None, propiedad_id: int | None = None,
           inquilino_id: int | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
           sesion: Session = Depends(obtener_sesion)):
    return servicio.buscar(sesion, q=q, estado=estado, propiedad_id=propiedad_id, inquilino_id=inquilino_id,
                           limit=limit, offset=offset)


@router.post("", status_code=201)
def crear(datos: ContratoEntrada, sesion: Session = Depends(obtener_sesion), usuario=Depends(get_current_user)):
    return servicio.crear(sesion, datos.model_dump(), usuario=_usuario(usuario))


@router.get("/{contrato_id}")
def obtener(contrato_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.obtener(sesion, contrato_id)


@router.put("/{contrato_id}")
def actualizar(contrato_id: int, datos: ContratoCambio, sesion: Session = Depends(obtener_sesion)):
    return servicio.actualizar(sesion, contrato_id, datos.model_dump(exclude_unset=True))


@router.delete("/{contrato_id}", status_code=204)
def borrar(contrato_id: int, sesion: Session = Depends(obtener_sesion)):
    servicio.borrar(sesion, contrato_id)
    return Response(status_code=204)


@router.post("/{contrato_id}/activar")
def activar(contrato_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.activar(sesion, contrato_id)


@router.post("/{contrato_id}/rescindir")
def rescindir(contrato_id: int, datos: RescisionEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.rescindir(sesion, contrato_id, fecha=datos.fecha, observaciones=datos.observaciones)


@router.post("/{contrato_id}/finalizar")
def finalizar(contrato_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.finalizar(sesion, contrato_id, hoy=tiempo.hoy())


@router.post("/{contrato_id}/precios", status_code=201)
def actualizar_precio(contrato_id: int, datos: PrecioEntrada, sesion: Session = Depends(obtener_sesion),
                      usuario=Depends(get_current_user)):
    return servicio.actualizar_precio(sesion, contrato_id, importe=datos.importe, vigencia_desde=datos.vigencia_desde,
                                      usuario=_usuario(usuario))


@router.post("/{contrato_id}/garantias", status_code=201)
def agregar_garantia(contrato_id: int, datos: GarantiaEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.agregar_garantia(sesion, contrato_id, datos.model_dump())


@router.delete("/{contrato_id}/garantias/{garantia_id}")
def quitar_garantia(contrato_id: int, garantia_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.quitar_garantia(sesion, contrato_id, garantia_id)


@router.post("/{contrato_id}/conceptos", status_code=201)
def agregar_concepto(contrato_id: int, datos: ConceptoEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.agregar_concepto(sesion, contrato_id, datos.model_dump())


@router.put("/{contrato_id}/conceptos/{concepto_id}")
def actualizar_concepto(contrato_id: int, concepto_id: int, datos: ConceptoCambio,
                        sesion: Session = Depends(obtener_sesion)):
    return servicio.actualizar_concepto(sesion, contrato_id, concepto_id, datos.model_dump(exclude_unset=True))


@router.get("/{contrato_id}/ajuste")
def proponer_ajuste(contrato_id: int, fecha: date | None = None, sesion: Session = Depends(obtener_sesion)):
    """El ajuste que le toca al contrato (hoy, o en `fecha`), con los valores que tomó. **No escribe nada.** Si falta
    un valor del índice, se baja de la fuente y se reintenta; si igual falta, 409 con las fechas que faltan."""
    return ajustes.proponer(sesion, contrato_id, fecha=fecha)


@router.post("/{contrato_id}/ajuste", status_code=201)
def aplicar_ajuste(contrato_id: int, datos: AjusteEntrada, sesion: Session = Depends(obtener_sesion),
                   usuario=Depends(get_current_user)):
    return ajustes.aplicar(sesion, contrato_id, fecha_ajuste=datos.fecha_ajuste, usuario=_usuario(usuario))
