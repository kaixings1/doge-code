export const DESCRIPTION =
  '替换 Jupyter 笔记本中指定单元格的内容。'
export const PROMPT = `完全替换 Jupyter 笔记本（.ipynb 文件）中指定单元格的内容为新的源代码。Jupyter 笔记本是结合了代码、文本和可视化的交互式文档，常用于数据分析和科学计算。notebook_path 参数必须是绝对路径，不能是相对路径。cell_number 从 0 开始计数。使用 edit_mode=insert 可在 cell_number 指定的索引处插入新单元格。使用 edit_mode=delete 可删除 cell_number 指定索引处的单元格。`