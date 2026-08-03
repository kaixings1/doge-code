import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import fs from 'fs'

function runPy(code: string): string {
  try {
    const r = execSync('python -c "' + code.replace(/"/g, '\\"') + '"', { encoding: 'utf-8', timeout: 15000 }).trim()
    return r || '(空)'
  } catch (e: any) { return '错误: ' + e.message }
}

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: '/excel read <file> | 读取 Excel\n/excel info <file> | 基本信息\n/excel csv <file> | 转为 CSV\n/excel sheets <file> | 列出工作表' }
  const file = p[1]
  if (!file || !fs.existsSync(file)) return { type: 'text', value: '文件不存在: ' + (file || '') }
  let r = ''
  if (c === 'read') {
    r = runPy("import openpyxl; wb=openpyxl.load_workbook('" + file.replace(/\\/g, '/') + "', data_only=True); ws=wb.active; rows=[]; [rows.append('|'.join([str(c.value or '') for c in row])) for i,row in enumerate(ws.iter_rows(values_only=False)) if i<30]; print('\\n'.join(rows[:20])); wb.close()")
  } else if (c === 'info') {
    r = runPy("import openpyxl; wb=openpyxl.load_workbook('" + file.replace(/\\/g, '/') + "'); print('Sheets:', wb.sheetnames, '| Active:', wb.active.title); wb.close()")
  } else if (c === 'sheets') {
    r = runPy("import openpyxl; wb=openpyxl.load_workbook('" + file.replace(/\\/g, '/') + "'); [print(s) for s in wb.sheetnames]; wb.close()")
  } else if (c === 'csv') {
    r = runPy("import openpyxl, csv; wb=openpyxl.load_workbook('" + file.replace(/\\/g, '/') + "', data_only=True); ws=wb.active; [print('|'.join([str(c.value or '') for c in row])) for row in ws.iter_rows(values_only=False)]; wb.close()")
  } else {
    r = '未知: ' + c
  }
  return { type: 'text', value: r || '(无输出)' }
}

const cmd = { type: 'local-jsx' as const, name: 'excel', description: 'Excel 文件读取与转换：read/info/sheets/csv', argumentHint: '<read|info|sheets|csv> <file>', isEnabled: () => true, load: () => import('./index.ts') } satisfies Command
export default cmd
