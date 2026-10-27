"""El PDF de la liquidación al propietario: lo que la inmobiliaria le manda con la rendición del mes.

El membrete es el de todos los PDF del motor (`libracore.emisor_del_pdf.emisor_para`): nombre, CUIT, dirección y
condición frente al IVA de la empresa de la instancia. Helvética (latin-1), como los comprobantes del motor.
"""

from __future__ import annotations

from decimal import Decimal

from fpdf import FPDF
from libracore import monedas
from libracore.emisor_del_pdf import emisor_para


def _plata(texto: str | None, moneda: str = "ARS") -> str:
    valor = Decimal(texto or "0")
    entero, _, dec = f"{abs(valor):,.2f}".partition(".")
    return f"{'-' if valor < 0 else ''}{monedas.simbolo(moneda)} {entero.replace(',', '.')},{dec}"


def _fecha(d) -> str:
    return d.strftime("%d-%m-%Y") if d else ""


def _latin1(texto: str) -> str:
    return (texto or "").encode("latin-1", "replace").decode("latin-1")


def generar(liq: dict) -> bytes:
    empresa = emisor_para({})
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, _latin1(empresa.get("nombre") or "Inmobiliaria"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for linea in (f"CUIT {empresa.get('cuit')}" if empresa.get("cuit") else "", empresa.get("direccion") or "",
                  empresa.get("iva_condition") or ""):
        if linea:
            pdf.cell(0, 5, _latin1(linea), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, _latin1(f"Liquidación {liq['numero']}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, _latin1(f"Propietario: {liq['propietario_nombre']}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, _latin1(f"Fecha: {_fecha(liq['fecha'])}    Movimientos hasta el {_fecha(liq['hasta'])}"),
             new_x="LMARGIN", new_y="NEXT")
    moneda = liq.get("moneda") or "ARS"
    pdf.cell(0, 6, _latin1(f"Moneda: {monedas.nombre(moneda)}"), new_x="LMARGIN", new_y="NEXT")
    if liq["estado"] == "anulada":
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "ANULADA", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(24, 6, "Fecha", border="B")
    pdf.cell(116, 6, "Detalle", border="B")
    pdf.cell(0, 6, "Importe", border="B", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for x in liq["items"]:
        pdf.cell(24, 6, _fecha(x["fecha"]))
        pdf.cell(116, 6, _latin1(x["descripcion"])[:80])
        pdf.cell(0, 6, _latin1(_plata(x["importe"], moneda)), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    for etiqueta, valor, negrita in (("Cobrado", liq["cobrado"], False),
                                     ("Gastos", f"-{liq['gastos']}" if Decimal(liq["gastos"]) else "0", False),
                                     ("Comisión de administración",
                                      f"-{liq['comision']}" if Decimal(liq["comision"]) else "0", False),
                                     ("Neto a cobrar", liq["neto"], True)):
        pdf.set_font("Helvetica", "B" if negrita else "", 10)
        pdf.cell(140, 7, _latin1(etiqueta), align="R")
        pdf.cell(0, 7, _latin1(_plata(valor, moneda)), align="R", new_x="LMARGIN", new_y="NEXT")
    if liq["estado"] == "pagada":
        pdf.ln(3)
        pdf.set_font("Helvetica", "", 9)
        pago = f"Pagada el {_fecha(liq['fecha_pago'])} por {liq['medio_pago']}"
        if liq.get("referencia_pago"):
            pago += f" ({liq['referencia_pago']})"
        pdf.cell(0, 6, _latin1(pago), new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
