/**
 * 笔记数据模型与类型定义
 */

// ====== 笔记类型 ======

export interface Note {
  /** UUID */
  id: string
  /** 标题 */
  title: string
  /** Markdown 内容 */
  content: string
  /** 标签列表（JSON 数组存储） */
  tags: string[]
  /** 是否置顶 */
  isPinned: boolean
  /** 创建时间（ISO 8601） */
  createdAt: string
  /** 更新时间（ISO 8601） */
  updatedAt: string
}

export interface CreateNoteInput {
  title: string
  content?: string
  tags?: string[]
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  tags?: string[]
  isPinned?: boolean
}

// ====== 搜索参数 ======

export interface SearchParams {
  /** 全文搜索关键词 */
  query?: string
  /** 按标签筛选 */
  tag?: string
  /** 排序字段 */
  sortBy?: 'updatedAt' | 'createdAt' | 'title'
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc'
  /** 页码（从 1 开始） */
  page?: number
  /** 每页数量 */
  limit?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ====== 数据库行格式（SQLite 原始行） ======

export interface NoteRow {
  id: string
  title: string
  content: string
  tags: string
  is_pinned: number
  created_at: string
  updated_at: string
}

// ====== 建表 SQL ======

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 全文搜索虚拟表（FTS5）
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, content, content='notes', content_rowid='rowid'
  );

  -- 触发器：新增时同步 FTS
  CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
  END;

  -- 触发器：删除时同步 FTS
  CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  END;

  -- 触发器：更新时同步 FTS（先删后插）
  CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
  END;

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_is_pinned ON notes(is_pinned);
  CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
`
