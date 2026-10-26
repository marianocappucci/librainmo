"""Propiedades y sus titulares. Las administran el admin y el operador."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_rol
from app.db import obtener_sesion
from app.modulos import exigir_modulo
from app.roles import ROLES
from app.schemas.propiedades import PropiedadCambio, PropiedadEntrada, TitularEntrada
from app.servicios import propiedades as servicio

router = APIRouter(
    prefix="/api/propiedades",
    tags=["propiedades"],
    dependencies=[*exigir_modulo("alquileres"), Depends(require_rol(*ROLES))],
)


@router.get("")
def buscar(q: str | None = None, estado: str | None = None, limit: int = Query(50, ge=1, le=200),
           offset: int = Query(0, ge=0), sesion: Session = Depends(obtener_sesion)):
    return servicio.buscar(sesion, q=q, estado=estado, limit=limit, offset=offset)


@router.post("", status_code=201)
def crear(datos: PropiedadEntrada, sesion: Session = Depends(obtener_sesion)):
    return servicio.crear(sesion, datos.model_dump())


@router.get("/{propiedad_id}")
def obtener(propiedad_id: int, sesion: Session = Depends(obtener_sesion)):
    return servicio.obtener(sesion, propiedad_id)


@router.put("/{propiedad_id}")
def actualizar(propiedad_id: int, datos: PropiedadCambio, sesion: Session = Depends(obtener_sesion)):
    return servicio.actualizar(sesion, propiedad_id, datos.model_dump(exclude_unset=True))


@router.put("/{propiedad_id}/titulares")
def fijar_titulares(propiedad_id: int, titulares: list[TitularEntrada], sesion: Session = Depends(obtener_sesion)):
    """Reemplaza la lista entera: los porcentajes suman 100."""
    return servicio.fijar_titulares(sesion, propiedad_id, [t.model_dump() for t in titulares])
