"""
Gera templates (PDF vetorial + PNG em alta resolução) no tamanho exato de
impressao da etiqueta de gondola da Elgin L42 Pro, para o usuario abrir
num editor (Illustrator, Figma, Photoshop, Affinity, Canva, Photopea etc.)
e posicionar cada elemento (nome, REF, codigo de barras, preco) com precisao.

Duas variantes:
  - inteira: 105 x 28mm, uma etiqueta so
  - metade:  105 x 28mm, com guia de corte central (2 etiquetas independentes)

Guias desenhadas (apenas referencia, nao fazem parte do que sera impresso):
  - Contorno da etiqueta
  - Notches (recortes fisicos) nas posicoes 10 / 15 / 10 mm
  - Margem de seguranca (area onde o conteudo deve ficar)
  - Régua de mm no topo
"""

from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont

LABEL_W_MM = 105.0
LABEL_H_MM = 28.0
SAFE_MARGIN_MM = 3.0
NOTCH_W_MM = 8.0
NOTCH_H_MM = 3.0
NOTCH_POSITIONS_MM = [10.0, 47.5, 89.0]  # centros aproximados dos 3 recortes (10/15/10)

DPI = 600
PX_PER_MM = DPI / 25.4
TOP_PAD_MM = 11.0
BOTTOM_PAD_MM = 6.0  # espaço extra pra não cortar os notches de baixo


def draw_guides_pdf(c: canvas.Canvas, half: bool):
    w = LABEL_W_MM * mm
    h = LABEL_H_MM * mm

    # Fundo amarelo (cor do papel pre-impresso, so pra referencia visual)
    c.setFillColorRGB(1, 0.898, 0)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Contorno externo
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.3)
    c.rect(0, 0, w, h, fill=0, stroke=1)

    # Notches (recortes fisicos) — desenhados como referencia, cor cinza claro
    c.setFillColorRGB(0.85, 0.85, 0.85)
    for cx_mm in NOTCH_POSITIONS_MM:
        cx = cx_mm * mm
        nw = NOTCH_W_MM * mm
        nh = NOTCH_H_MM * mm
        c.ellipse(cx - nw / 2, h - nh, cx + nw / 2, h + nh, fill=1, stroke=0)
        c.ellipse(cx - nw / 2, -nh, cx + nw / 2, nh, fill=1, stroke=0)

    # Margem de seguranca (area onde o conteudo deve ficar) — tracejado
    c.setStrokeColorRGB(0.85, 0.1, 0.1)
    c.setLineWidth(0.25)
    c.setDash(2, 2)
    m = SAFE_MARGIN_MM * mm
    c.rect(m, m, w - 2 * m, h - 2 * m, fill=0, stroke=1)
    c.setDash()

    # Linha de corte central (so na versao metade)
    if half:
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.35)
        c.setDash(1.5, 1.5)
        c.line(w / 2, 0, w / 2, h)
        c.setDash()

    # Regua de mm no topo (fora da etiqueta, acima)
    c.setStrokeColorRGB(0.3, 0.5, 0.55)
    c.setFillColorRGB(0.3, 0.5, 0.55)
    c.setLineWidth(0.2)
    ruler_y = h + 4 * mm
    for x_mm in range(0, int(LABEL_W_MM) + 1, 5):
        x = x_mm * mm
        tick_h = 2.2 * mm if x_mm % 10 == 0 else 1.2 * mm
        c.line(x, ruler_y, x, ruler_y - tick_h)
        if x_mm % 10 == 0:
            c.setFont('Helvetica', 5)
            c.drawCentredString(x, ruler_y + 1 * mm, str(x_mm))

    # Legenda pequena fora da area de seguranca (canto, so referencia)
    c.setFont('Helvetica', 4.2)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    label_txt = 'GUIA — Etiqueta de Gôndola METADE (105 x 28mm, corte central)' if half \
        else 'GUIA — Etiqueta de Gôndola INTEIRA (105 x 28mm)'
    c.drawString(1.5 * mm, h + 7.2 * mm, label_txt)


def make_pdf(path: str, half: bool):
    w = LABEL_W_MM * mm
    h = LABEL_H_MM * mm
    top_pad = TOP_PAD_MM * mm
    bottom_pad = BOTTOM_PAD_MM * mm
    c = canvas.Canvas(path, pagesize=(w, h + top_pad + bottom_pad))
    c.translate(0, bottom_pad)
    draw_guides_pdf(c, half)
    c.showPage()
    c.save()


def draw_guides_png(draw: ImageDraw.ImageDraw, ox: int, oy: int, half: bool):
    w = int(LABEL_W_MM * PX_PER_MM)
    h = int(LABEL_H_MM * PX_PER_MM)

    # Fundo amarelo
    draw.rectangle([ox, oy, ox + w, oy + h], fill=(255, 229, 0))
    # Contorno
    draw.rectangle([ox, oy, ox + w, oy + h], outline=(0, 0, 0), width=2)

    # Notches
    nw = int(NOTCH_W_MM * PX_PER_MM)
    nh = int(NOTCH_H_MM * PX_PER_MM)
    for cx_mm in NOTCH_POSITIONS_MM:
        cx = ox + int(cx_mm * PX_PER_MM)
        draw.ellipse([cx - nw // 2, oy - nh, cx + nw // 2, oy + nh], fill=(220, 220, 220))
        draw.ellipse([cx - nw // 2, oy + h - nh, cx + nw // 2, oy + h + nh], fill=(220, 220, 220))

    # Margem de seguranca
    m = int(SAFE_MARGIN_MM * PX_PER_MM)
    safe_box = [ox + m, oy + m, ox + w - m, oy + h - m]
    _dashed_rect(draw, safe_box, (217, 26, 26), width=2, dash=8, gap=6)

    # Corte central (metade)
    if half:
        cx = ox + w // 2
        _dashed_line(draw, (cx, oy), (cx, oy + h), (0, 0, 0), width=3, dash=10, gap=8)

    return w, h


def _dashed_line(draw, p1, p2, fill, width=2, dash=8, gap=6):
    import math
    x1, y1 = p1
    x2, y2 = p2
    length = math.hypot(x2 - x1, y2 - y1)
    if length == 0:
        return
    dx, dy = (x2 - x1) / length, (y2 - y1) / length
    pos = 0.0
    while pos < length:
        seg_end = min(pos + dash, length)
        draw.line([x1 + dx * pos, y1 + dy * pos, x1 + dx * seg_end, y1 + dy * seg_end], fill=fill, width=width)
        pos += dash + gap


def _dashed_rect(draw, box, fill, width=2, dash=8, gap=6):
    x0, y0, x1, y1 = box
    _dashed_line(draw, (x0, y0), (x1, y0), fill, width, dash, gap)
    _dashed_line(draw, (x1, y0), (x1, y1), fill, width, dash, gap)
    _dashed_line(draw, (x1, y1), (x0, y1), fill, width, dash, gap)
    _dashed_line(draw, (x0, y1), (x0, y0), fill, width, dash, gap)


def make_png(path: str, half: bool):
    top_pad = int(TOP_PAD_MM * PX_PER_MM)
    bottom_pad = int(BOTTOM_PAD_MM * PX_PER_MM)
    w = int(LABEL_W_MM * PX_PER_MM)
    h = int(LABEL_H_MM * PX_PER_MM)
    img = Image.new('RGB', (w, h + top_pad + bottom_pad), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw_guides_png(draw, 0, top_pad, half)

    # Regua de mm
    try:
        font = ImageFont.truetype('arial.ttf', 16)
        font_small = ImageFont.truetype('arial.ttf', 12)
    except Exception:
        font = ImageFont.load_default()
        font_small = font

    ruler_y = top_pad - int(4 * PX_PER_MM)
    for x_mm in range(0, int(LABEL_W_MM) + 1, 5):
        x = int(x_mm * PX_PER_MM)
        tick_h = int(6 * PX_PER_MM / 10) if x_mm % 10 == 0 else int(3 * PX_PER_MM / 10)
        draw.line([x, ruler_y, x, ruler_y + tick_h], fill=(70, 130, 145), width=2)
        if x_mm % 10 == 0:
            draw.text((x, ruler_y - 18), str(x_mm), fill=(70, 130, 145), font=font_small, anchor='ms')

    label_txt = 'GUIA — Etiqueta de Gôndola METADE (105 x 28mm, corte central)' if half \
        else 'GUIA — Etiqueta de Gôndola INTEIRA (105 x 28mm)'
    draw.text((6, 6), label_txt, fill=(90, 90, 90), font=font_small)

    img.save(path, dpi=(DPI, DPI))


if __name__ == '__main__':
    make_pdf('template-etiqueta-gondola-inteira.pdf', half=False)
    make_pdf('template-etiqueta-gondola-metade.pdf', half=True)
    make_png('template-etiqueta-gondola-inteira.png', half=False)
    make_png('template-etiqueta-gondola-metade.png', half=True)
    print('done')
