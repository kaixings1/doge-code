/** 笔记本单元格类型 */
export type NotebookCellType = 'code' | 'markdown' | 'raw'

/** 笔记本单元格 */
export type NotebookCell = {
  id?: string
  cell_type: string
  source: string | string[]
  outputs?: NotebookCellOutput[]
  execution_count?: number
  metadata?: Record<string, unknown>
}

/** 笔记本输出图片 */
export type NotebookOutputImage = {
  image_data: string
  media_type: string
}

/** 笔记本单元格输出 */
export type NotebookCellOutput = {
  output_type: string
  execution_count?: number
  data?: Record<string, unknown>
  text?: string | string[]
  metadata?: Record<string, unknown>
  ename?: string
  evalue?: string
  traceback?: string[]
}

/** 笔记本单元格源（处理后的单元格数据） */
export type NotebookCellSource = {
  cellType: string
  source: string
  language?: string
  cell_id: string
  outputs?: NotebookCellSourceOutput[]
  execution_count?: number
}

/** 笔记本单元格源输出 */
export type NotebookCellSourceOutput = {
  output_type: string
  text?: string
  image?: NotebookOutputImage
}

/** 笔记本内容（.ipynb 文件结构） */
export type NotebookContent = {
  cells?: NotebookCell[]
  metadata?: Record<string, unknown>
  nbformat?: number
  nbformat_minor?: number
  [key: string]: unknown
}
