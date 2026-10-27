"""Recuperación de contraseña (`/auth/forgot-password`, `/auth/reset-password`) y correo saliente (`/admin/smtp`).

🔴 Sin `app.state.password_reset` los endpoints existen y explotan con un 500 recién al primer pedido; sin las rutas de
SMTP la pantalla de Configuración da 404. Ninguna de las dos cosas hace caer el arranque, por eso hay un test que mide
cada una.
"""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.roles import ADMIN, OPERADOR
from tests.conftest import CLAVE


def test_forgot_password_sin_smtp_avisa_con_503_y_la_app_sigue_en_pie(app, monkeypatch):
    monkeypatch.delenv("LIBRAAUTH_SMTP_HOST", raising=False)
    monkeypatch.delenv("LIBRAAUTH_SMTP_FROM_EMAIL", raising=False)
    cliente = TestClient(app, base_url="https://testserver")
    # El captcha lo aprueba el doble del conftest; el campo igual tiene que viajar.
    r = cliente.post("/auth/forgot-password", json={"identificador": ADMIN, "captcha": "x"})
    assert r.status_code == 503, r.text
    # Y la app sigue contestando: un pedido de reset sin SMTP no la tumba.
    assert cliente.get("/salud").status_code == 200


def test_reset_password_con_un_token_inventado_da_400(app):
    cliente = TestClient(app, base_url="https://testserver")
    r = cliente.post("/auth/reset-password", json={"token": "no-existe", "new_password": "otra-clave-larga"})
    assert r.status_code == 400, r.text


def test_el_correo_saliente_esta_montado_y_es_del_administrador(app, admin, como):
    """Montado: el 400 del probar sin SMTP cargado prueba que la ruta existe (si no, la atendería el catch-all de la
    SPA y daría 404/405). Del administrador: el operador no lee ni prueba el correo de la instancia."""
    assert admin.get("/admin/smtp").status_code == 200
    r = admin.post("/admin/smtp/probar")
    assert r.status_code == 400, r.text

    operador = como("operador")
    assert operador.get("/admin/smtp").status_code == 403
    assert operador.post("/admin/smtp/probar").status_code == 403
    assert TestClient(app, base_url="https://testserver").get("/admin/smtp").status_code == 401


def test_el_flujo_completo_pide_el_enlace_y_cambia_la_clave(app, monkeypatch):
    """Con SMTP (acá, el del entorno) el pedido genera un enlace a `LIBRAINMO_RESET_URL_BASE` y el token cambia la
    clave. Se intercepta el envío para no abrir una conexión de verdad."""
    monkeypatch.setenv("LIBRAAUTH_SMTP_HOST", "smtp.invalido.test")
    monkeypatch.setenv("LIBRAAUTH_SMTP_FROM_EMAIL", "no-responder@invalido.test")
    app.state.users.create(
        username="ana", name="Ana Ficticia", password=CLAVE, role=OPERADOR, email="ana@invalido.test"
    )
    enviados: list[dict] = []
    app.state.password_reset._send_email = lambda **kw: enviados.append(kw)

    cliente = TestClient(app, base_url="https://testserver")
    r = cliente.post("/auth/forgot-password", json={"identificador": "ana", "captcha": "x"})
    assert r.status_code == 200, r.text
    assert len(enviados) == 1
    assert enviados[0]["to_email"] == "ana@invalido.test"
    enlace = re.search(r"(https://\S+\?token=\S+)", enviados[0]["cuerpo"]).group(1)
    assert enlace.startswith("https://dev.librainmo.com.ar/reset-password?token=")

    token = enlace.split("token=", 1)[1]
    r = cliente.post("/auth/reset-password", json={"token": token, "new_password": "clave-nueva-123"})
    assert r.status_code == 200, r.text

    def _login(clave: str) -> int:
        return cliente.post("/auth/login", json={"username": "ana", "password": clave, "captcha": "x"}).status_code

    assert _login("clave-nueva-123") == 200
    assert _login(CLAVE) == 401
    # De un solo uso.
    r = cliente.post("/auth/reset-password", json={"token": token, "new_password": "otra-clave-456"})
    assert r.status_code == 400, r.text
