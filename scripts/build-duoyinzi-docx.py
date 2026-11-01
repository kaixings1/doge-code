#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 pingyin.md 转成一份"干净好排版"的 Word 文档。

设计原则：不做花哨排版，只保证结构清晰、行距正常、方便用户自己在 Word 里调。

用法:
    python scripts/build-duoyinzi-docx.py [输入.md] [输出.docx]

排版（都是 Word 里可一键改的标准样式）：
  - A4，页边距 上下 2.54cm / 左右 3.17cm（Word 默认）
  - 正文：宋体（中文）+ Times New Roman（西文）小四 12pt，1.5 倍行距，首行缩进 2 字符
  - 一级标题：黑体 三号 18pt 居中
  - 二级标题：黑体 四号 14pt，段前后留白
  - 三级标题：黑体 小四 12pt
  - 不使用分栏、不使用表格、不使用边框线
  - 表格内容转成"一行一条"的普通文字，用 全角空格 分隔字段
"""

import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

SRC = sys.argv[1] if len(sys.argv) > 1 else 'pingyin.md'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'pingyin.docx'

CN = '宋体'
HEI = '黑体'
EN = 'Times New Roman'


def set_font(run, cn=CN, size=12, bold=False):
    run.font.name = EN
    run.font.size = Pt(size)
    run.font.bold = bold
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts')
        rpr.append(rf)
    rf.set(qn('w:ascii'), EN)
    rf.set(qn('w:hAnsi'), EN)
    rf.set(qn('w:eastAsia'), cn)
    rf.set(qn('w:cs'), EN)


def para(doc, text='', *, cn=CN, size=12, bold=False, align=None,
         before=0, after=0, indent_chars=0, line=1.5):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = line
    if indent_chars:
        # 首行缩进 N 个字符（按字号换算成 pt）
        pf.first_line_indent = Pt(size * indent_chars)
    if align is not None:
        p.alignment = align
    if text:
        r = p.add_run(text)
        set_font(r, cn, size, bold)
    return p


INLINE = re.compile(r'(\*\*.+?\*\*)')


def add_rich(p, text, size=12, cn=CN):
    """处理 **加粗** 片段。"""
    for seg in INLINE.split(text):
        if not seg:
            continue
        if seg.startswith('**') and seg.endswith('**'):
            r = p.add_run(seg[2:-2])
            set_font(r, HEI, size, True)
        else:
            r = p.add_run(seg)
            set_font(r, cn, size)


def parse(md):
    lines = md.replace('\r\n', '\n').split('\n')
    blocks, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        # 表格
        if ln.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s\-:|]+\|$', lines[i + 1].strip()):
            header = [c.strip() for c in ln.strip().strip('|').split('|')]
            rows, i = [], i + 2
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            blocks.append(('table', header, rows))
            continue
        if ln.startswith('#'):
            m = re.match(r'^(#+)\s+(.*)$', ln)
            blocks.append(('h', len(m.group(1)), m.group(2).strip()))
            i += 1
            continue
        if ln.strip() == '---':
            i += 1
            continue
        if ln.startswith('>'):
            blocks.append(('quote', ln.lstrip('> ').strip()))
            i += 1
            continue
        if ln.startswith('- '):
            items = []
            while i < len(lines) and lines[i].startswith('- '):
                items.append(lines[i][2:].strip())
                i += 1
            blocks.append(('list', items))
            continue
        if re.match(r'^\d+\.\s', ln):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s', lines[i]):
                items.append(re.sub(r'^\d+\.\s', '', lines[i]).strip())
                i += 1
            blocks.append(('olist', items))
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#', '|', '>', '- ')) \
                and not re.match(r'^\d+\.\s', lines[i]) and lines[i].strip() != '---':
            buf.append(lines[i].strip())
            i += 1
        blocks.append(('p', ''.join(buf)))
    return blocks


def build(blocks):
    doc = Document()

    # 页面：Word 默认 A4 + 默认边距
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.54)
    sec.bottom_margin = Cm(2.54)
    sec.left_margin = Cm(3.17)
    sec.right_margin = Cm(3.17)

    st = doc.styles['Normal']
    st.font.name = EN
    st.font.size = Pt(12)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), CN)

    for b in blocks:
        kind = b[0]

        if kind == 'h':
            level, text = b[1], b[2]
            if level == 1:
                para(doc, text, cn=HEI, size=18, bold=True,
                     align=WD_ALIGN_PARAGRAPH.CENTER, before=0, after=18)
            elif level == 2:
                para(doc, text, cn=HEI, size=14, bold=True, before=18, after=8)
            elif level == 3:
                para(doc, text, cn=HEI, size=12, bold=True, before=10, after=4)
            else:
                p = para(doc, before=6, after=2)
                add_rich(p, text, 12)
            continue

        if kind == 'quote':
            p = para(doc, before=2, after=2, line=1.3)
            r = p.add_run(b[1])
            set_font(r, CN, 10.5)
            continue

        if kind in ('list', 'olist'):
            for idx, item in enumerate(b[1], 1):
                prefix = f'{idx}. ' if kind == 'olist' else '· '
                p = doc.add_paragraph()
                pf = p.paragraph_format
                pf.space_before = Pt(0)
                pf.space_after = Pt(2)
                pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
                pf.line_spacing = 1.5
                pf.left_indent = Pt(24)
                pf.first_line_indent = Pt(-12)
                r = p.add_run(prefix)
                set_font(r, CN, 12)
                add_rich(p, item, 12)
            continue

        if kind == 'p':
            if not b[1]:
                continue
            p = para(doc, indent_chars=2, after=4)
            add_rich(p, b[1], 12)
            continue

        if kind == 'table':
            header, rows = b[1], b[2]
            # 4 列数据表（总表 / 详解表）→ 转成"一条一段"的普通文字，不再画表
            # 表头不输出，靠上方的三级标题说明字段
            n = len(header)
            for row in rows:
                cells = [c for c in row[:n]]
                p = doc.add_paragraph()
                pf = p.paragraph_format
                pf.space_before = Pt(0)
                pf.space_after = Pt(2)
                pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
                pf.line_spacing = 1.4
                pf.left_indent = Pt(12)
                pf.first_line_indent = Pt(-12)
                r = p.add_run('　'.join(cells))
                set_font(r, CN, 10.5)
            para(doc, before=0, after=0)
    return doc


def main():
    src = Path(SRC)
    if not src.exists():
        raise SystemExit(f'找不到输入文件: {SRC}')
    out = Path(OUT)
    if out.parent and not out.parent.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        print(f'已创建目录: {out.parent}')

    doc = build(parse(src.read_text(encoding='utf-8')))
    doc.core_properties.title = '小学多音字与形近字辨析大全'
    try:
        doc.save(str(out))
    except PermissionError:
        raise SystemExit(f'无法写入 {out}，请先关闭 Word 再试')
    print(f'已生成: {out}')
    print('格式：A4 / 单栏 / 宋体小四 12pt / 1.5 倍行距 / 无表格')


if __name__ == '__main__':
    main()
