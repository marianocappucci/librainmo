"""Gastos por cuenta del propietario, liquidaciones al propietario y el control de fondos de terceros."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app import tiempo
from app.auth import get_current_user, require_rol
from app.db import obtener_sesion
from app.modulos import exigir_modulo
from app.roles import ROLES
from app.schemas.liquidaciones import GastoEntrada, LiquidacionEntrada, MotivoEntrada, PagoEntrada
from app.servicios import gastos as servicio_gastos
from app.servicios import liquidacion_pdf
from app.servicios import liquidaciones as servicio

_DEPENDENCIAS = [*exigir_modulo("alquileres"), Depends(require_rol(*ROLES))]
gastos = APIRouter(prefix="/api/gastos", tags=["gastos"], dependencies=_DEPENDENCIAS)
router = APIRouter(prefix="/api/liquidaciones", tags=["liquidaciones"], dependencies=_DEPENDENCIAS)
reportes = APIRouter(prefix="/api/reportes", tags=["reportes"], dependencies=_DEPENDENCIAS)


def _usuario(usuario: dict | None) -> str:
    return (usuario or {}).get("username") or "Sistema"


@gastos.get("")
def buscar_gastos(propiedad_id: int | None = None, desde: date | None = None, hasta: date | None = None,
                  incluir_anulados: bool = False, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                  sesion: Session = Depends(obtener_sesion)):
    return servicio_gastos.buscar(sesion, propiedad_id=propiedad_id, desde=desde, hasta=hasta,
                                  incluir_anulados=incluir_anulados, limit=limit, offset=offset)


@gastos.post("", status_code=201)
def registrar_gasto(datos: GastoEntrada, sesion: Session = Depends(obtener_sesion), usuario=Depends(get_current_user)):
    return servicio_gastos.registrar(sesion, **datos.model_dump(), usuario=_usuario(usuario))


@gastos.get("/{gasto_id}")
def obtener_gasto(gasto_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio_gastos.obtener(sesion, gasto_id)


@gastos.post("/{gasto_id}/anular")
def anular_gasto(gasto_id: int, datos: MotivoEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio_gastos.anular(sesion, gasto_id, motivo=datos.motivo)


@router.get("/previsualizar")
def previsualizar(propietario_id: int, hasta: date | None = None, sesion: Session = Depends(obtener_sesion)):
    """Lo que entraría en la liquidación del propietario hasta `hasta` (hoy, si no se dice). No escribe."""
    return servicio.previsualizar(sesion, propietario_id, hasta=hasta or tiempo.hoy())


@router.get("")
def buscar(propietario_id: int | None = None, estado: str | None = None, limit: int = Query(100, ge=1, le=500),
           offset: int = Query(0, ge=0), sesion: Session = Depends(obtener_sesion)):
    return servicio.buscar(sesion, propietario_id=propietario_id, estado=estado, limit=limit, offset=offset)


@router.post("", status_code=201)
def emitir(datos: LiquidacionEntrada, sesion: Session = Depends(obtener_sesion), usuario=Depends(get_current_user)):
    return servicio.emitir(sesion, datos.propietario_id, fecha=datos.fecha, hasta=datos.hasta,
                           observaciones=datos.observaciones, usuario=_usuario(usuario))


@router.get("/{liquidacion_id}")
def obtener(liquidacion_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.obtener(sesion, liquidacion_id)


@router.get("/{liquidacion_id}/pdf")
def pdf(liquidacion_id: int, sesion: Session = Depends(obtener_sesion)):
    liq = servicio.obtener(sesion, liquidacion_id)
    return Response(liquidacion_pdf.generar(liq), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="liquidacion-{liq["numero"]}.pdf"'})


@router.post("/{liquidacion_id}/pagar")
def pagar(liquidacion_id: int, datos: PagoEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.pagar(sesion, liquidacion_id, fecha=datos.fecha, medio_pago=datos.medio_pago,
                          referencia=datos.referencia)


@router.post("/{liquidacion_id}/anular")
def anular(liquidacion_id: int, datos: MotivoEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.anular(sesion, liquidacion_id, motivo=datos.motivo)


@reportes.get("/fondos-de-terceros")
def fondos_de_terceros(sesion: Session = Depends(obtener_sesion)):
    """Cuánto se les debe a los propietarios y cuánto deben los inquilinos."""
    return servicio.fondos_de_terceros(sesion)
