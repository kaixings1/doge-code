/**
 * SWE-agent Bug 修复循环策略
 *
 * 来源：SWE-agent (https://github.com/princeton-nlp/SWE-agent) - 13k+ Stars
 * 核心理念：定位 → 分析 → 生成补丁 → 验证 的自动修复流程
 */

import { BaseLoopStrategy } from './base.js'
import type { LoopGoal, SubTask, LoopStrategyName } from '../types.js'

export class SWEAgentStrategy extends BaseLoopStrategy {
  readonly name: LoopStrategyName = 'swe-agent'
  readonly displayName = 'SWE-agent Bug 修复循环'
  readonly description = 'Bug 修复专用循环引擎：定位→分析→生成补丁→验证，自动迭代直到测试通过。'

  private patchAttempts = 0
  private maxPatchAttempts = 5
  private lastVerifyResult = ''

  decompose(goal: LoopGoal): SubTask[] {
    return [
      this.createTask('定位：在代码库中定位 bug 的具体位置（文件、行号、相关代码）'),
      this.createTask('分析：分析 bug 的根因，理解为什么会出现这个问题'),
      this.createTask('生成补丁：基于分析结果，生成修复代码（统一 diff 格式）'),
      this.createTask('验证：运行测试验证修复是否成功，确认没有引入新问题'),
    ]
  }

  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } {
    const verifyTask = subTasks.find(t => t.description.includes('验证'))
    const patchTask = subTasks.find(t => t.description.includes('补丁'))

    if (verifyTask?.status === 'completed') {
      return { achieved: true, reason: '测试全部通过，bug 修复成功' }
    }

    if (this.patchAttempts >= this.maxPatchAttempts) {
      return { achieved: false, reason: `已达到最大补丁尝试次数 (${this.maxPatchAttempts})` }
    }

    if (patchTask?.status === 'failed' && this.patchAttempts >= 3) {
      return { achieved: false, reason: '连续 3 次补丁生成失败，需要人工介入' }
    }

    const completed = subTasks.filter(t => t.status === 'completed').length
    return { achieved: false, reason: `修复进度: ${completed}/4 阶段完成` }
  }

  getSystemPrompt(goal: LoopGoal): string {
    return `你是一个专业的 Bug 修复工程师，遵循 SWE-agent 修复流程。

## 修复目标
${goal.description}

## 修复流程（4 阶段循环）

### 阶段 1：定位（Localize）
- 在代码库中搜索相关代码
- 确定 bug 的具体位置（文件路径 + 行号）
- 理解代码的上下文和逻辑

### 阶段 2：分析（Analyze）
- 分析 bug 的根本原因
- 理解为什么会出现这个问题
- 确定修复策略（修改哪些代码）

### 阶段 3：生成补丁（Generate Patch）
- 使用统一 diff 格式生成修复代码
- 格式：@@ -oldStart,oldLines +newStart,newLines @@
- 确保补丁最小化，只修改必要的代码
- 不要引入不必要的变更

### 阶段 4：验证（Verify）
- 运行相关测试验证修复
- 确认 bug 已被修复
- 确认没有引入新的失败
- 如果验证失败，返回阶段 2 重新分析

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '所有测试通过'}

## 规则
- 每次只生成一个补丁，验证后再决定下一步
- 如果连续 3 次验证失败，报告失败原因
- 补丁格式必须是标准的 unified diff`
  }

  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean {
    if (iteration >= maxIterations) return false
    if (this.patchAttempts >= this.maxPatchAttempts) return false

    const verifyTask = subTasks.find(t => t.description.includes('验证'))
    if (verifyTask?.status === 'completed') return false

    return true
  }

  /** 生成修复补丁 */
  generatePatch(bugLocation: string, analysis: string): string {
    this.patchAttempts++
    return `--- 补丁 #${this.patchAttempts} ---
位置: ${bugLocation}
分析: ${analysis}
补丁内容: [待 AI 生成]`
  }

  /** 验证补丁 */
  verifyPatch(_patch: string, testCommand: string): { passed: boolean; output: string } {
    this.lastVerifyResult = `运行: ${testCommand}`
    return { passed: false, output: this.lastVerifyResult }
  }

  /** 获取修复统计 */
  getStats(): { attempts: number; maxAttempts: number; lastResult: string } {
    return {
      attempts: this.patchAttempts,
      maxAttempts: this.maxPatchAttempts,
      lastResult: this.lastVerifyResult,
    }
  }

  /** 重置修复状态 */
  reset(): void {
    this.patchAttempts = 0
    this.lastVerifyResult = ''
  }
}
