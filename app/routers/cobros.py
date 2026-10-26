"""El cobro de una cuota, su recibo y su anulación."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app import tiempo
from app.auth import get_current_user, require_rol
from app.db import obtener_sesion
from app.modulos import exigir_modulo
from app.roles import ROLES
from app.schemas.cobros import AnularCobroEntrada, CobroEntrada
from app.servicios import cobros as servicio

_DEPENDENCIAS = [*exigir_modulo("alquileres"), Depends(require_rol(*ROLES))]
router = APIRouter(prefix="/api/cobros", tags=["cobros"], dependencies=_DEPENDENCIAS)
de_cuotas = APIRouter(prefix="/api/cuotas", tags=["cobros"], dependencies=_DEPENDENCIAS)


def _usuario(usuario: dict | None) -> str:
    return (usuario or {}).get("username") or "Sistema"


@de_cuotas.get("/{cuota_id}/cobro")
def proponer(cuota_id: int, fecha: date | None = None, sesion: Session = Depends(obtener_sesion)):
    """Cuánto hay que cobrar si paga el día `fecha` (hoy, si no se dice), con el punitorio. No escribe."""
    return servicio.proponer(sesion, cuota_id, fecha=fecha or tiempo.hoy())


@de_cuotas.post("/{cuota_id}/cobrar", status_code=201)
def cobrar(cuota_id: int, datos: CobroEntrada, sesion: Session = Depends(obtener_sesion),
           usuario=Depends(get_current_user)):
    return servicio.cobrar(sesion, cuota_id, fecha=datos.fecha, medios=[m.model_dump() for m in datos.medios],
                           condonar_punitorio=datos.condonar_punitorio, usuario=_usuario(usuario))


@router.get("")
def buscar(contrato_id: int | None = None, desde: date | None = None, hasta: date | None = None,
           incluir_anulados: bool = False, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
           sesion: Session = Depends(obtener_sesion)):
    return servicio.buscar(sesion, contrato_id=contrato_id, desde=desde, hasta=hasta,
                           incluir_anulados=incluir_anulados, limit=limit, offset=offset)


@router.get("/{cobro_id}")
def obtener(cobro_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.obtener(sesion, cobro_id)


@router.post("/{cobro_id}/anular")
def anular(cobro_id: int, datos: AnularCobroEntrada, sesion: Session = Depends(obtener_sesion),
           usuario=Depends(get_current_user)):
    return servicio.anular(sesion, cobro_id, motivo=datos.motivo, usuario=_usuario(usuario))


@router.get("/{cobro_id}/recibo.pdf")
def recibo_pdf(cobro_id: int, sesion: Session = Depends(obtener_sesion)):
    return Response(servicio.recibo_pdf(sesion, cobro_id), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="recibo-{cobro_id}.pdf"'})
