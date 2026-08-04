/** 笔记本单元格 */
export type NotebookCell = Record<string, unknown>

/** 笔记本内容（.ipynb 文件结构） */
export type NotebookContent = {
  cells?: NotebookCell[]
  metadata?: Record<string, unknown>
  nbformat?: number
  nbformat_minor?: number
  [key: string]: unknown
}
