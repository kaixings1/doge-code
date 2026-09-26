---
name: pdf
description: 处理 PDF 文件 — 提取文本、创建 PDF、合并文档。
---

# PDF 处理技能

你现在具备 PDF 操作的专长。请遵循以下工作流：

## 读取 PDF

**选项 1：快速文本提取（首选）**
```bash
# 使用 pdftotext（poppler-utils）
pdftotext input.pdf -  # 输出到标准输出
pdftotext input.pdf output.txt  # 输出到文件

# 如果没有 pdftotext，可以试试：
python3 -c "
import fitz  # PyMuPDF
doc = fitz.open('input.pdf')
for page in doc:
    print(page.get_text())
"
```

**选项 2：带元数据的逐页读取**
```python
import fitz  # pip install pymupdf

doc = fitz.open("input.pdf")
print(f"页数: {len(doc)}")
print(f"元数据: {doc.metadata}")

for i, page in enumerate(doc):
    text = page.get_text()
    print(f"--- 第 {i+1} 页 ---")
    print(text)
```

## 创建 PDF

**选项 1：从 Markdown（推荐）**
```bash
# 使用 pandoc
pandoc input.md -o output.pdf

# 使用自定义样式
pandoc input.md -o output.pdf --pdf-engine=xelatex -V geometry:margin=1in
```

**选项 2：编程方式**
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("output.pdf", pagesize=letter)
c.drawString(100, 750, "你好，PDF！")
c.save()
```

**选项 3：从 HTML**
```bash
# 使用 wkhtmltopdf
wkhtmltopdf input.html output.pdf

# 或者改用 Python
python3 -c "
import pdfkit
pdfkit.from_file('input.html', 'output.pdf')
"
```

## 合并 PDF

```python
import fitz

result = fitz.open()
for pdf_path in ["file1.pdf", "file2.pdf", "file3.pdf"]:
    doc = fitz.open(pdf_path)
    result.insert_pdf(doc)
result.save("merged.pdf")
```

## 拆分 PDF

```python
import fitz

doc = fitz.open("input.pdf")
for i in range(len(doc)):
    single = fitz.open()
    single.insert_pdf(doc, from_page=i, to_page=i)
    single.save(f"page_{i+1}.pdf")
```

## 关键库

| 任务 | 库 | 安装 |
|------|---------|---------|
| 读/写/合并 | PyMuPDF | `pip install pymupdf` |
| 从零创建 | ReportLab | `pip install reportlab` |
| HTML 转 PDF | pdfkit | `pip install pdfkit` + wkhtmltopdf |
| 文本提取 | pdftotext | `brew install poppler` / `apt install poppler-utils` |

## 最佳实践

1. 使用前**始终先检查工具是否已安装**
2. **处理编码问题** —— PDF 可能包含各种字符编码
3. **大型 PDF**：逐页处理以避免内存问题
4. **扫描版 PDF 用 OCR**：如果文本提取返回空，使用 `pytesseract`
