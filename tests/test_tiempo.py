"""El huso y el formato de fecha del ecosistema: Argentina (UTC-3 fijo), `dd-mm-aaaa` en pantalla."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app import tiempo
from tests.ayudas import fijar_ahora


def test_el_reloj_es_el_de_argentina(monkeypatch):
    # 01:30 UTC del 1-11 son las 22:30 del 31-10 en Argentina: «hoy» todavía es el 31.
    fijar_ahora(monkeypatch, "2026-11-01T01:30:00+00:00")
    assert tiempo.hoy() == date(2026, 10, 31)
    assert tiempo.ahora().utcoffset() == timedelta(hours=-3)
    assert tiempo.ahora().hour == 22


def test_un_datetime_sin_zona_es_hora_argentina():
    """Lo que escribe una persona en un formulario es hora local, no UTC."""
    local = tiempo.a_local(datetime(2026, 10, 27, 9, 30))
    assert local.utcoffset() == timedelta(hours=-3)
    assert local.hour == 9


def test_un_datetime_con_zona_se_pasa_a_hora_argentina():
    assert tiempo.a_local(datetime(2026, 10, 27, 12, 30, tzinfo=UTC)).hour == 9


def test_fechas_en_pantalla_dd_mm_aaaa():
    assert tiempo.formatear_fecha(date(2026, 1, 5)) == "05-01-2026"
    assert tiempo.formatear_fecha(None) == ""
    assert tiempo.formatear_fecha_hora(datetime(2026, 10, 27, 12, 30, tzinfo=UTC)) == "27-10-2026 09:30"
    assert tiempo.formatear_fecha_hora(None) == ""
