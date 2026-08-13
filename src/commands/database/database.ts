export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return [
      '🗄️ 数据库工具',
      '',
      '📖 用法: ',
      '  /database schema <db>           查看 Schema（表结构 + 索引 + 关系）',
      '  /database tables <db>           列出所有表和行数',
      '  /database er <db>               生成 ER 图（Mermaid 格式）',
      '  /database preview <db>  <表名>  预览表数据（前 20 行）',
      '  /database query  <db>  <SQL>    执行 SQL 查询',
      '  /database indexes <db>           列出所有索引',
      '  /database fks <db>              列出所有外键关系',
      '  /database stats <db>            数据库统计信息',
      '  /database export <db> <表名>    导出表数据为 JSON/CSV',
      '',
      '支持数据库:',
      '  • SQLite (文件路径，如 mydb.sqlite)',
      '  • PostgreSQL (postgresql://user:pass@host/db)',
      '  • MySQL (mysql://user:pass@host/db)',
      '',
      '💡 示例: ',
      '  /database schema mydb.sqlite',
      '  /database er mydb.sqlite',
      '  /database preview mydb.sqlite users',
      '  /database query mydb.sqlite "SELECT * FROM users LIMIT 5"',
      '  /database stats mydb.sqlite',
      '  /database export mydb.sqlite users csv',
    ].join('\n')
  }

  const parts = args.trim().split(/\s+/)
  const command = parts[0]

  if (command === 'tables' && parts[1]) {
    const dbPath = parts[1]
    return generateSchemaInfo(dbPath)
  }

  if (command === 'schema' && parts[1]) {
    const dbPath = parts[1]
    return generateSchema(dbPath)
  }

  if (command === 'er' && parts[1]) {
    const dbPath = parts[1]
    return generateERDiagram(dbPath)
  }

  if (command === 'preview' && parts[1] && parts[2]) {
    return previewTableData(parts[1], parts[2])
  }

  if (command === 'query' && parts[1] && parts[2]) {
    const sql = parts.slice(2).join(' ')
    return executeQuery(parts[1], sql)
  }

  if (command === 'indexes' && parts[1]) {
    return generateIndexes(parts[1])
  }

  if (command === 'fks' && parts[1]) {
    return generateFKRelationships(parts[1])
  }

  if (command === 'stats' && parts[1]) {
    return await generateStats(parts[1])
  }

  if (command === 'export' && parts[1] && parts[2]) {
    const format = parts[3] || 'json'
    return await exportTableData(parts[1], parts[2], format)
  }

  return `未知命令: ${command}\n\n使用 /database 查看帮助`
}

function generateSchemaInfo(dbPath: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]

    if (tables.length === 0) {
      return `## 数据库Schema\n\n在 ${dbPath} 中未找到表`
    }

    const lines: string[] = [`## 数据库Schema：${dbPath}`, '', `### 表 (${tables.length})`, '']

    for (const table of tables) {
      const count = db.query(`SELECT COUNT(*) as count FROM "${table.name}"`).get() as { count: number }
      lines.push(`- **${table.name}** (${count.count} rows)`)

      const columns = db.query(`PRAGMA table_info("${table.name}")`).all() as any[]
      for (const col of columns) {
        const pk = col.pk > 0 ? ' [PK]' : ''
        const nullable = col.notnull ? '' : ' [NULL]'
        lines.push(`  - ${col.name}: ${col.type}${pk}${nullable}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  } catch (error) {
    return `## ❌ 错误\n\n读取 ${dbPath} 的 schema 失败：${error}`
  }
}

function generateSchema(dbPath: string): string {
  return generateSchemaInfo(dbPath)
}

function generateERDiagram(dbPath: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]

    let mermaid = '```mermaid\nerDiagram\n'

    for (const table of tables) {
      const columns = db.query(`PRAGMA table_info("${table.name}")`).all() as any[]

      mermaid += `  ${table.name} {\n`
      for (const col of columns) {
        const type = mapSqliteType(col.type)
        const pk = col.pk > 0 ? ' PK' : ''
        mermaid += `    ${type} ${col.name}${pk}\n`
      }
      mermaid += '  }\n\n'
    }

    // Add relationships - enhanced detection
    for (const table of tables) {
      // Method 1: PRAGMA foreign_key_list (most reliable)
      const fks = db.query(`PRAGMA foreign_key_list("${table.name}")`).all() as any[]
      for (const fk of fks) {
        if (fk.table && fk.from && fk.to) {
          mermaid += `  ${fk.table} ||--o{ ${table.name} : "${fk.from}_${fk.to}"\n`
        }
      }

      // Method 2: Parse CREATE TABLE for inline REFERENCES
      const createTable = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?", [table.name]).all() as { sql: string }[]
      if (createTable[0]?.sql) {
        const sql = createTable[0].sql
        const inlineRefs = sql.match(/REFERENCES\s+(\w+)\s*\(([^)]+)\)/gi)
        if (inlineRefs) {
          for (const ref of inlineRefs) {
            const match = ref.match(/REFERENCES\s+(\w+)\s*\(([^)]+)\)/i)
            if (match) {
              // Check if already added by PRAGMA
              const alreadyAdded = fks.some(fk => fk.table === match[1])
              if (!alreadyAdded) {
                mermaid += `  ${match[1]} ||--o{ ${table.name} : "ref"\n`
              }
            }
          }
        }
      }

      // Method 3: Naming convention inference (xxx_id -> xxx table)
      const columns = db.query(`PRAGMA table_info("${table.name}")`).all() as any[]
      for (const col of columns) {
        const colName = col.name as string
        if (colName.endsWith('_id') && colName !== 'id') {
          const refTable = colName.slice(0, -3) // Remove _id suffix
          const tableExists = tables.some(t => t.name === refTable || t.name === refTable + 's')
          if (tableExists) {
            // Check if already added
            const alreadyAdded = fks.some(fk => fk.table === refTable || fk.table === refTable + 's')
            if (!alreadyAdded) {
              const targetTable = tables.some(t => t.name === refTable) ? refTable : refTable + 's'
              mermaid += `  ${targetTable} ||--o{ ${table.name} : "${colName}"\n`
            }
          }
        }
      }
    }

    return `## ER Diagram\n\n\`\`\`mermaid\n${mermaid}\`\`\``
  } catch (error) {
    return `## ❌ 错误\n\n生成 ER 图失败：${error}`
  }
}

function mapSqliteType(sqliteType: string): string {
  const type = sqliteType.toLowerCase()
  if (type.includes('int')) return 'int'
  if (type.includes('text') || type.includes('char')) return 'string'
  if (type.includes('real') || type.includes('float') || type.includes('double')) return 'float'
  if (type.includes('blob')) return 'blob'
  if (type.includes('bool')) return 'boolean'
  if (type.includes('date') || type.includes('time')) return 'datetime'
  return 'string'
}

// ─── 新增功能 ───────────────────────────────────────────────

/** 预览表数据 */
function previewTableData(dbPath: string, tableName: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const rows = db.query(`SELECT * FROM "${tableName}" LIMIT 20`).all() as Record<string, unknown>[]
    if (rows.length === 0) {
      return `## 📋 表: ${tableName}\n\n表为空`
    }

    const columns = Object.keys(rows[0])
    const lines = [
      `## 📋 表: ${tableName} (${rows.length} 行)`,
      '',
      `| ${columns.join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
    ]

    for (const row of rows) {
      lines.push(`| ${columns.map(c => String(row[c] ?? 'NULL')).join(' | ')} |`)
    }

    return lines.join('\n')
  } catch (error) {
    return `❌ 预览失败: ${error}`
  }
}

/** 执行 SQL 查询 */
function executeQuery(dbPath: string, sql: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const trimmed = sql.trim().toUpperCase()
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('WITH')) {
      const rows = db.query(sql).all() as Record<string, unknown>[]
      if (rows.length === 0) {
        return `## 📊 查询结果\n\n(0 行)`
      }
      const columns = Object.keys(rows[0])
      const lines = [
        `## 📊 查询结果 (${rows.length} 行)`,
        '',
        `| ${columns.join(' | ')} |`,
        `| ${columns.map(() => '---').join(' | ')} |`,
      ]
      for (const row of rows.slice(0, 50)) {
        lines.push(`| ${columns.map(c => String(row[c] ?? 'NULL')).join(' | ')} |`)
      }
      if (rows.length > 50) lines.push(`\n... 还有 ${rows.length - 50} 行`)
      return lines.join('\n')
    } else {
      const result = db.run(sql)
      return `## ✅ 执行成功\n\n影响行数: ${result?.changes ?? 0}`
    }
  } catch (error) {
    return `❌ 查询失败: ${error}`
  }
}

/** 列出所有索引 */
function generateIndexes(dbPath: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    const lines: string[] = ['## 📇 数据库索引', '']

    for (const table of tables) {
      const indexes = db.query(`PRAGMA index_list("${table.name}")`).all() as { name: string; unique: number }[]
      if (indexes.length > 0) {
        lines.push(`### ${table.name}`)
        for (const idx of indexes) {
          const info = db.query(`PRAGMA index_info("${idx.name}")`).all() as { name: string }[]
          const cols = info.map(i => i.name).join(', ')
          lines.push(`  • ${idx.name}${idx.unique ? ' (UNIQUE)' : ''}: ${cols}`)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  } catch (error) {
    return `❌ 索引查询失败: ${error}`
  }
}

/** 列出所有外键关系 */
function generateFKRelationships(dbPath: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    const lines: string[] = ['## 🔗 外键关系', '']

    let fkFound = false
    for (const table of tables) {
      const fks = db.query(`PRAGMA foreign_key_list("${table.name}")`).all() as {
        id: number
        seq: number
        table: string
        from: string
        to: string
        on_update: string
        on_delete: string
      }[]
      if (fks.length > 0) {
        fkFound = true
        lines.push(`### ${table.name}`)
        for (const fk of fks) {
          lines.push(`  • ${fk.from} → ${fk.table}.${fk.to}  (ON UPDATE: ${fk.on_update}, ON DELETE: ${fk.on_delete})`)
        }
        lines.push('')
      }
    }

    if (!fkFound) {
      lines.push('未发现外键关系')
    }

    return lines.join('\n')
  } catch (error) {
    return `❌ 外键查询失败: ${error}`
  }
}

/** 数据库统计信息 */
function generateStats(dbPath: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    let totalRows = 0
    let totalIndexes = 0
    let totalFKs = 0

    for (const table of tables) {
      const count = db.query(`SELECT COUNT(*) as c FROM "${table.name}"`).get() as { c: number }
      totalRows += count.c
      const idxs = db.query(`PRAGMA index_list("${table.name}")`).all()
      totalIndexes += idxs.length
      const fks = db.query(`PRAGMA foreign_key_list("${table.name}")`).all()
      totalFKs += fks.length
    }

    // 获取数据库文件大小
    let fileSize = 0
    try {
      fileSize = Bun.file(dbPath).size
    } catch { /* ignore */ }

    const sizeStr = fileSize > 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
      : fileSize > 1024
        ? `${(fileSize / 1024).toFixed(1)} KB`
        : `${fileSize} B`

    return [
      '## 📊 数据库统计',
      '',
      `数据库: ${dbPath}`,
      `表数量: ${tables.length}`,
      `总行数: ${totalRows}`,
      `索引数: ${totalIndexes}`,
      `外键数: ${totalFKs}`,
      `文件大小: ${sizeStr}`,
      '',
      '### 表详情',
      ...tables.map(t => {
        const count = db.query(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number }
        return `  • ${t.name}: ${count.c} 行`
      }),
    ].join('\n')
  } catch (error) {
    return `❌ 统计失败: ${error}`
  }
}

/** 导出表数据 */
async function exportTableData(dbPath: string, tableName: string, format: string): Promise<string> {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const rows = db.query(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[]
    if (rows.length === 0) {
      return `表 ${tableName} 为空`
    }

    const columns = Object.keys(rows[0])
    const ext = format.toLowerCase() === 'csv' ? 'csv' : 'json'
    const exportPath = `${tableName}_export.${ext}`

    if (ext === 'csv') {
      const header = columns.join(',')
      const data = rows.map(r => columns.map(c => {
        const v = String(r[c] ?? '')
        return v.includes(',') ? `"${v}"` : v
      }).join(','))
      await Bun.write(exportPath, [header, ...data].join('\n'))
    } else {
      await Bun.write(exportPath, JSON.stringify(rows, null, 2))
    }

    return `✅ 已导出 ${rows.length} 行数据到 ${exportPath}`
  } catch (error) {
    return `❌ 导出失败: ${error}`
  }
}
