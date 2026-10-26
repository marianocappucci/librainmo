"""El devengado mensual: previsualizar, generar, cargar variables y anular."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_rol
from app.db import obtener_sesion
from app.modulos import exigir_modulo
from app.roles import ROLES
from app.schemas.cuotas import AnulacionEntrada, GenerarEntrada, LineaEntrada
from app.servicios import cuotas as servicio

router = APIRouter(
    prefix="/api/cuotas",
    tags=["cuotas"],
    dependencies=[*exigir_modulo("alquileres"), Depends(require_rol(*ROLES))],
)


@router.get("")
def buscar(contrato_id: int | None = None, estado: str | None = None, desde: date | None = None,
           hasta: date | None = None, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
           sesion: Session = Depends(obtener_sesion)):
    return servicio.buscar(sesion, contrato_id=contrato_id, estado=estado, desde=desde, hasta=hasta, limit=limit,
                           offset=offset)


@router.post("/previsualizar")
def previsualizar(datos: GenerarEntrada, sesion: Session = Depends(obtener_sesion)):
    """Lo que se generaría, sin escribir nada."""
    return servicio.previsualizar(sesion, datos.ancla, contrato_ids=datos.contrato_ids)


@router.post("/generar")
def generar(datos: GenerarEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.generar(sesion, datos.ancla, contrato_ids=datos.contrato_ids, variables=datos.variables)


@router.get("/{cuota_id}")
def obtener(cuota_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.obtener(sesion, cuota_id)


@router.post("/{cuota_id}/lineas", status_code=201)
def agregar_linea(cuota_id: int, datos: LineaEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.agregar_linea(sesion, cuota_id, importe=datos.importe, concepto_id=datos.concepto_id,
                                  descripcion=datos.descripcion)


@router.post("/{cuota_id}/anular")
def anular(cuota_id: int, datos: AnulacionEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.anular(sesion, cuota_id, motivo=datos.motivo)
