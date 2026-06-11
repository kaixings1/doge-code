import { readFileSync, existsSync } from 'fs'

export async function call(args: string, context: any): Promise<string> {
  const paths = args ? args.trim().split(/\s+/) : []

  if (paths.length < 2) {
    return `## compare

用法: /compare <路径1> <路径2>

比较两个文件或目录的差异

示例:
/compare file1.txt file2.txt
/compare dir1/ dir2/
`
  }

  const [path1, path2] = paths
  let result = `## compare

比较: ${path1} ↔ ${path2}\n\n`

  // 检查文件是否存在
  const exists1 = existsSync(path1)
  const exists2 = existsSync(path2)

  if (!exists1 || !exists2) {
    result += `⚠ 路径不存在:\n`
    if (!exists1) result += `- ${path1} (不存在)\n`
    if (!exists2) result += `- ${path2} (不存在)\n`
    return result
  }

  // 获取文件信息
  const stat1 = existsSync(path1) ? '文件存在' : '文件不存在'
  const stat2 = existsSync(path2) ? '文件存在' : '文件不存在'

  result += `### 状态\n`
  result += `- ${path1}: ${stat1}\n`
  result += `- ${path2}: ${stat2}\n\n`

  // 如果是文件，比较内容
  if (existsSync(path1) && existsSync(path2)) {
    try {
      const content1 = readFileSync(path1, 'utf8')
      const content2 = readFileSync(path2, 'utf8')

      if (content1 === content2) {
        result += '✓ 文件内容完全相同\n'
      } else {
        result += '⚠ 文件内容不同\n'
        const lines1 = content1.split('\n')
        const lines2 = content2.split('\n')
        const maxLines = Math.max(lines1.length, lines2.length)
        let diffCount = 0

        result += '\n### 差异详情\n'
        for (let i = 0; i < Math.min(maxLines, 50); i++) {
          if (lines1[i] !== lines2[i]) {
            diffCount++
            if (diffCount <= 10) {
              result += `行 ${i + 1}:\n`
              result += `- ${path1}: ${lines1[i] || '(空行)'}\n`
              result += `+ ${path2}: ${lines2[i] || '(空行)'}\n`
            }
          }
        }
        if (diffCount > 10) {
          result += `\n... 还有 ${diffCount - 10} 处差异未显示\n`
        }
      }
    } catch (error) {
      result += `⚠ 读取文件时出错: ${error}\n`
    }
  }

  result += `\n> 比较完成`
  return result
}
