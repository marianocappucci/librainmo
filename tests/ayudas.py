"""Atajos de los tests."""

from __future__ import annotations


def fijar_ahora(monkeypatch, iso_utc: str) -> None:
    """Congela el reloj del motor en ese instante (UTC).

    `2026-11-01T01:30:00+00:00` son las 22:30 del 31-10 en Argentina.
    """
    from datetime import datetime

    from libracore import fechas

    instante = datetime.fromisoformat(iso_utc)
    monkeypatch.setattr(fechas, "_ahora_utc", lambda: instante)
