"""Sonda de salud pública. La usa el healthcheck del contenedor."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import obtener_sesion
from app.tiempo import ahora

router = APIRouter(tags=["salud"])


# 🔑 **Dos rutas, un solo handler.** `/salud` es el nombre de este producto, que
# habla castellano; `/health` es la convención de la familia y el default de
# `libracore.provisioning`, o sea la que el alta de un cliente le estampa al
# healthcheck de su contenedor.
@router.get("/salud")
@router.get("/health")
def salud(sesion: Session = Depends(obtener_sesion)) -> dict[str, object]:
    """Falla cerrado: si la base no responde, la sonda no dice 'ok'."""
    sesion.execute(text("SELECT 1"))
    return {"estado": "ok", "ts": ahora().isoformat()}
