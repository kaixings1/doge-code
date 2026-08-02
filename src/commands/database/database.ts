export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return `## Database Schema Visualization

### Schema Explorer

### Commands
- /database schema <connection>    Display schema visualization
- /database tables <db>            List tables with row counts
- /database er <connection>        Generate ER diagram

### Supported Databases
- SQLite (via bun:sqlite)
- PostgreSQL
- MySQL

### Example
/database schema mydb.sqlite
/database tables mydb.sqlite
/database er mydb.sqlite

> Database schema visualization tool`
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

  return `Unknown command: ${command}\n\nUsage:\n  /database schema <connection>\n  /database tables <db>\n  /database er <connection>`
}

function generateSchemaInfo(dbPath: string): string {
  try {
    const { Database } = require('bun:sqlite')
    const db = new Database(dbPath)

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]

    if (tables.length === 0) {
      return `## Database Schema\n\nNo tables found in ${dbPath}`
    }

    const lines: string[] = [`## Database Schema: ${dbPath}`, '', `### Tables (${tables.length})`, '']

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
    return `## Error\n\nFailed to read schema from ${dbPath}: ${error}`
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

    let mermaid = 'erDiagram\n'

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

    // Add relationships
    const fkQuery = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND sql LIKE '%FOREIGN KEY%'").all() as { sql: string }[]
    for (const fk of fkQuery) {
      const fkMatch = fk.sql.match(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\w+)\s*\(([^)]+)\)/i)
      if (fkMatch) {
        mermaid += `  ${fkMatch[2] || "unknown"} ||--o{ ${tables[0]?.name || "unknown"} : "foreign_key"\n`
      }
    }

    return `## ER Diagram\n\n\`\`\`mermaid\n${mermaid}\`\`\``
  } catch (error) {
    return `## Error\n\nFailed to generate ER diagram: ${error}`
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
