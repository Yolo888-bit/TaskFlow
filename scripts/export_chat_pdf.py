# -*- coding: utf-8 -*-
"""
把项目开发过程中的「用户 <-> AI 助手」文字对话导出为 PDF。
用法：
    python scripts/export_chat_pdf.py [输出路径]
默认输出：D:\\AI辅助对话记录.pdf
"""

import os
import re
import sys
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chat_transcript import META, INDEX, TURNS  # noqa: E402

# ---------------- 主题色 ----------------
GREEN = colors.HexColor("#1DC78A")
GREEN_DARK = colors.HexColor("#0E9E6B")
GREEN_BG = colors.HexColor("#E8F8F1")
GRAY_BG = colors.HexColor("#F7F8FA")
BORDER = colors.HexColor("#E6E8EB")
TEXT = colors.HexColor("#1F2328")
MUTED = colors.HexColor("#6B7280")

FONT_DIR = "C:/Windows/Fonts"


def register_fonts():
    """注册中文字体，失败时尝试其他候选。"""
    candidates = [
        ("YaHei", os.path.join(FONT_DIR, "msyh.ttc"), 0),
        ("YaHei", os.path.join(FONT_DIR, "msyh.ttf"), 0),
        ("YaHei", os.path.join(FONT_DIR, "simhei.ttf"), 0),
    ]
    bold_candidates = [
        ("YaHeiBold", os.path.join(FONT_DIR, "msyhbd.ttc"), 0),
        ("YaHeiBold", os.path.join(FONT_DIR, "msyhbd.ttf"), 0),
        ("YaHeiBold", os.path.join(FONT_DIR, "simhei.ttf"), 0),
    ]
    regular_ok = False
    for name, path, idx in candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
                regular_ok = True
                break
            except Exception:
                continue
    bold_ok = False
    for name, path, idx in bold_candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
                bold_ok = True
                break
            except Exception:
                continue
    if not regular_ok:
        raise RuntimeError("未找到可用的中文字体")
    return "YaHei", ("YaHeiBold" if bold_ok else "YaHei")


BASE, BOLD = register_fonts()


# ---------------- 样式 ----------------
def S(name, **kw):
    kw.setdefault("fontName", BASE)
    kw.setdefault("fontSize", 9.6)
    kw.setdefault("leading", 15.4)
    kw.setdefault("textColor", TEXT)
    kw.setdefault("alignment", TA_LEFT)
    kw.setdefault("wordWrap", "CJK")  # 中英混排按字符断行，避免在空格处提前换行
    return ParagraphStyle(name, **kw)


STY_BODY = S("body")
STY_BODY_USER = S("body_user", fontSize=9.8, leading=15.8)
STY_BULLET = S("bullet", leftIndent=11, spaceBefore=1)
STY_CODE = S("code", fontSize=8.4, leading=12.6, textColor=colors.HexColor("#374151"))
STY_CELL = S("cell", fontSize=8.6, leading=12.4)
STY_CELL_HEAD = S("cellh", fontName=BOLD, fontSize=8.6, leading=12.4)
STY_H = S("h", fontName=BOLD, fontSize=11.5, leading=17, spaceBefore=6, spaceAfter=3)
STY_TITLE = S("title", fontName=BOLD, fontSize=26, leading=34, alignment=TA_CENTER,
              textColor=colors.HexColor("#111827"))
STY_SUB = S("sub", fontSize=11.5, leading=18, alignment=TA_CENTER, textColor=MUTED)
STY_LABEL_USER = S("lu", fontName=BOLD, fontSize=9.2, leading=13, textColor=GREEN_DARK)
STY_LABEL_AI = S("la", fontName=BOLD, fontSize=9.2, leading=13, textColor=MUTED)
STY_TURN = S("turn", fontName=BOLD, fontSize=10.4, leading=15, textColor=colors.HexColor("#111827"))

PW, PH = A4
ML = MR = 17 * mm
MT = 18 * mm
MB = 16 * mm
CONTENT_W = PW - ML - MR


# ---------------- 文本解析 ----------------
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text):
    """转义后处理 **粗体** 与 `行内代码`"""
    t = esc(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+)`", r'<font color="#0F766E">\1</font>', t)
    return t


def is_table_row(line):
    return line.strip().startswith("|") and line.strip().endswith("|") and line.count("|") >= 3


def is_separator(line):
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return all(re.fullmatch(r":?-{2,}:?", c or "") for c in cells) and len(cells) > 0


def split_cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def build_table(rows, width):
    header, body = [], []
    for i, line in enumerate(rows):
        if is_separator(line):
            continue
        cells = split_cells(line)
        if not header:
            header = cells
        else:
            body.append(cells)
    ncol = len(header)
    data = [[Paragraph(inline(c), STY_CELL_HEAD) for c in header]]
    for r in body:
        r = (r + [""] * ncol)[:ncol]
        data.append([Paragraph(inline(c), STY_CELL) for c in r])
    col_w = width / max(ncol, 1)
    t = Table(data, colWidths=[col_w] * ncol, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F4")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDE1E5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def render_content(text, width, body_style=STY_BODY):
    """把一段 Markdown 轻量文本渲染成 flowable 列表。"""
    out = []
    lines = text.split("\n")
    i = 0
    para_buf = []

    def flush_para():
        if para_buf:
            html = "<br/>".join(inline(x) for x in para_buf)
            out.append(Paragraph(html, body_style))
            para_buf.clear()

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        stripped = line.strip()

        # 代码块
        if stripped.startswith("```"):
            flush_para()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            code_html = "<br/>".join(esc(x).replace(" ", "&nbsp;") for x in buf) or "&nbsp;"
            inner = Table([[Paragraph(code_html, STY_CODE)]], colWidths=[width - 16])
            inner.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F3F4F6")),
                ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E1E4E8")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            out.append(inner)
            out.append(Spacer(1, 4))
            continue

        # 表格
        if is_table_row(line):
            flush_para()
            rows = []
            while i < len(lines) and is_table_row(lines[i]):
                rows.append(lines[i])
                i += 1
            out.append(build_table(rows, width))
            out.append(Spacer(1, 4))
            continue

        # 空行 -> 段落分隔
        if not stripped:
            flush_para()
            out.append(Spacer(1, 5))
            i += 1
            continue

        # 标题（## ）
        if re.match(r"^#{1,4}\s", stripped):
            flush_para()
            out.append(Paragraph(inline(re.sub(r"^#{1,4}\s", "", stripped)), STY_H))
            i += 1
            continue

        # 无序列表
        if re.match(r"^[-*]\s+", stripped):
            flush_para()
            txt = re.sub(r"^[-*]\s+", "", stripped)
            out.append(Paragraph("• " + inline(txt), STY_BULLET))
            i += 1
            continue

        # 有序列表 / 普通段落
        para_buf.append(stripped)
        i += 1

    flush_para()
    return out


def message_block(label, label_style, content, bg, accent, width, body_style):
    """带背景色与左侧色条的对话块。"""
    inner = []
    inner.append(Paragraph(label, label_style))
    inner.append(Spacer(1, 3))
    inner.extend(render_content(content, width - 22, body_style))

    cell = Table([[inner]], colWidths=[width])
    cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (-1, -1), 3.2, accent),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return cell


# ---------------- 页面装饰 ----------------
def draw_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(GREEN)
    canvas.rect(0, PH - 6 * mm, PW, 6 * mm, stroke=0, fill=1)
    canvas.setFont(BOLD, 8.6)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(PW / 2, 12 * mm, META["course"])
    canvas.restoreState()


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFont(BASE, 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(ML, PH - MT + 6 * mm, "AI 辅助对话记录 · " + META["project"])
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(ML, PH - MT + 4.4 * mm, PW - MR, PH - MT + 4.4 * mm)
    canvas.drawRightString(PW - MR, 10 * mm, "第 %d 页" % doc.page)
    canvas.drawString(ML, 10 * mm, META["course"])
    canvas.restoreState()


def build_story():
    story = []
    today = datetime.now().strftime("%Y-%m-%d %H:%M")

    # ---- 封面 ----
    story.append(Spacer(1, 34 * mm))
    story.append(Paragraph("AI 辅助对话记录", STY_TITLE))
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph("个人任务与进度管理系统（TaskFlow）· 开发全过程对话留痕", STY_SUB))
    story.append(Spacer(1, 12 * mm))

    meta_rows = [
        ["课程", META["course"]],
        ["选题", META["topic"]],
        ["技术栈", META["stack"]],
        ["对话时间", META["period"]],
        ["对话轮次", META["turns"]],
        ["导出时间", today],
        ["图例说明", "绿色区块 = 用户输入（着重标出）；灰色区块 = AI 助手回复"],
    ]
    t = Table([[Paragraph("<b>%s</b>" % k, STY_CELL), Paragraph(esc(v), STY_CELL)]
               for k, v in meta_rows],
              colWidths=[26 * mm, CONTENT_W - 26 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("BACKGROUND", (0, 0), (0, -1), GRAY_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 10 * mm))

    legend = Table([[Paragraph(
        '<font color="#0E9E6E"><b>说明</b></font>　本文件仅收录对话窗口中的文字内容，'
        '不含生成的代码与文档正文，用于「AI 辅助开发过程」评分项的过程留痕。', STY_CELL)]],
        colWidths=[CONTENT_W])
    legend.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GREEN_BG),
        ("LINEBEFORE", (0, 0), (-1, -1), 3.2, GREEN),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(legend)

    # ---- 目录 ----
    story.append(NextPageTemplate("body"))
    story.append(PageBreak())
    story.append(Paragraph("对话索引", STY_H))
    story.append(Spacer(1, 4))
    idx_data = [[Paragraph("<b>轮次</b>", STY_CELL_HEAD), Paragraph("<b>内容摘要</b>", STY_CELL_HEAD)]]
    for a, b in INDEX:
        idx_data.append([Paragraph(esc(a), STY_CELL), Paragraph(inline(b), STY_CELL)])
    idx_t = Table(idx_data, colWidths=[22 * mm, CONTENT_W - 22 * mm], repeatRows=1)
    idx_t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(idx_t)
    story.append(Spacer(1, 8))
    story.append(PageBreak())

    # ---- 正文 ----
    turn_no = 0
    pending = []
    for msg in TURNS:
        if msg["role"] == "user":
            turn_no += 1
            head = Table([[Paragraph("第 %d 轮 · 用户输入" % turn_no, STY_TURN)]], colWidths=[CONTENT_W])
            head.setStyle(TableStyle([
                ("LINEBELOW", (0, 0), (-1, -1), 0.8, GREEN),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
            ]))
            block = [head, Spacer(1, 5),
                     message_block("用户", STY_LABEL_USER, msg["content"],
                                   GREEN_BG, GREEN, CONTENT_W, STY_BODY_USER)]
            pending = [KeepTogether(block)]
        else:
            block = [Spacer(1, 7),
                     message_block("AI 助手", STY_LABEL_AI, msg["content"],
                                   GRAY_BG, MUTED, CONTENT_W, STY_BODY),
                     Spacer(1, 12)]
            story.extend(pending)
            story.extend(block)
            pending = []
    if pending:
        story.extend(pending)

    story.append(Spacer(1, 6))
    end = Table([[Paragraph(
        "<b>— 全文完 —</b>　共 %d 轮对话，%d 条消息（用户 %d 条 / AI 助手 %d 条）。"
        % (len([m for m in TURNS if m["role"] == "user"]), len(TURNS),
           len([m for m in TURNS if m["role"] == "user"]),
           len([m for m in TURNS if m["role"] == "assistant"])), STY_CELL)]],
        colWidths=[CONTENT_W])
    end.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRAY_BG),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(end)
    return story


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else r"D:\AI辅助对话记录.pdf"
    os.makedirs(os.path.dirname(out), exist_ok=True)

    doc = BaseDocTemplate(
        out, pagesize=A4,
        leftMargin=ML, rightMargin=MR, topMargin=MT, bottomMargin=MB,
        title="AI 辅助对话记录 - " + META["project"],
        author="TaskFlow 项目组",
        subject="项目开发全过程对话留痕",
    )
    cover_frame = Frame(ML, MB, CONTENT_W, PH - MT - MB, id="cover")
    body_frame = Frame(ML, MB, CONTENT_W, PH - MT - MB + 4 * mm, id="body")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=draw_cover),
        PageTemplate(id="body", frames=[body_frame], onPage=draw_page),
    ])
    doc.build(build_story())
    print("已生成:", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
