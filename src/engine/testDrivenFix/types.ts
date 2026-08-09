/**
 * engine/testDrivenFix/types.ts — 测试驱动修复闭环的类型定义
 *
 * 吸收自 Agentless (SWE-bench 定位→修复流水线)：
 *   - 测试失败 → 文件级定位 → 相关位置定位 → 编辑位置定位
 *   - edit_file 命令生成 → 补丁解析应用 → lint/语法/回归验证
 */

/** 仓库中的符号（函数/类/方法），带起止行 */
export interface RepoSymbol {
  name: string
  kind: 'function' | 'class' | 'method' | 'global'
  /** 1-based 起始行（含） */
  startLine: number
  /** 1-based 结束行（含） */
  endLine: number
  /** 所在文件 */
  file: string
}

/** 仓库结构：文件 → 符号列表 */
export interface RepoStructure {
  /** 文件路径 → 该文件的符号 */
  symbols: Record<string, RepoSymbol[]>
  /** 排除的测试文件 */
  testFiles: string[]
}

/** 测试失败信息 */
export interface TestFailure {
  /** 失败测试所在文件 */
  file?: string
  /** 失败测试名 */
  testName?: string
  /** 错误消息 */
  message: string
  /** 原始失败输出（完整） */
  rawOutput: string
}

/** 文件级定位结果：候选文件（按重要度排序） */
export interface LocalizedFiles {
  files: string[]
  /** 判定为不相关的目录 */
  irrelevantDirs: string[]
}

/** 定位位置：某文件内需要关注的具体位置 */
export interface CodeLocation {
  file: string
  /** 支持 line / function / class 三类 */
  kind: 'line' | 'function' | 'class'
  name?: string
  /** 行号（line 类型时有效） */
  line?: number
}

/** LLM 生成的 edit_file 命令 */
export interface EditCommand {
  file: string
  start: number
  end: number
  content: string
}

/** 补丁应用结果 */
export interface PatchResult {
  /** 修改的文件 */
  editedFiles: string[]
  /** 每个文件的旧内容 → 新内容 */
  contents: Array<{ file: string; old: string; new: string }>
  /** 应用的命令数 */
  appliedCount: number
  /** 未应用的命令（含原因） */
  failedCommands: Array<{ command: EditCommand; reason: string }>
}

/** 验证结果 */
export interface VerifyResult {
  ok: boolean
  /** lint 输出 */
  lintOutput?: string
  /** 测试输出 */
  testOutput?: string
  /** 错误信息 */
  errors: string[]
}

/** 修复循环结果 */
export interface FixLoopResult {
  success: boolean
  /** 各阶段输出 */
  stages: Array<{ name: string; output: string }>
  /** 最终补丁 */
  patches: PatchResult[]
  /** 验证结果 */
  verify?: VerifyResult
  /** 迭代次数 */
  iterations: number
}
