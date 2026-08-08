/**
 * engine/coders/editBlockCoder.ts — 编辑策略（参考 Aider EditBlockCoder）
 *
 * 功能：解析 AI 回复中的 SEARCH/REPLACE 块，应用到文件。
 * 对齐 Aider editblock_coder.py：
 *   - find_original_update_blocks() → parseEditBlocks()
 *   - apply_edits() → applyEdits()
 *   - do_replace() → replaceContent()
 */

import { findSimilarFile } from '../../utils/file.js';

export type EditBlock = {
  path: string;
  original: string;
  updated: string;
  endIndex: number;
};

export interface Coder {
  editFormat: string;
  getEdits(response: string): EditBlock[];
  applyEdits(
    edits: EditBlock[],
    rootDir: string,
  ): Promise<{ applied: EditBlock[]; failed: { edit: EditBlock; reason: string }[] }>;
}

/**
 * EditBlockCoder：使用 SEARCH/REPLACE 块格式的编辑策略
 *
 * 对齐 Aider EditBlockCoder.edit_format = "diff"
 */
export class EditBlockCoder implements Coder {
  editFormat = 'diff';

  /**
   * 从 AI 回复中提取 SEARCH/REPLACE 编辑块
   *
   * 支持格式：
   *   ```lang
   *   filename.ext
   *   <<<<<<< SEARCH
   *   original content
   *   =======
   *   updated content
   *   >>>>>>> REPLACE
   *   ```
   */
  getEdits(response: string): EditBlock[] {
    const edits: EditBlock[] = [];
    const lines = response.split('\n');
    let i = 0;

    while (i < lines.length) {
      // 检查 SEARCH 标记
      if (lines[i].trim() === '<<<<<<< SEARCH') {
        const edit = this.parseEditBlock(lines, i);
        if (edit) {
          edits.push(edit);
          i = edit.endIndex;
          continue;
        }
      }
      i++;
    }

    return edits;
  }

  /**
   * 应用编辑块到文件系统
   *
   * 流程：
   * 1. 读取目标文件
   * 2. 执行精确匹配替换
   * 3. 失败时尝试模糊匹配（same file 内最近似行块）
   * 4. 收集成功/失败结果
   */
  async applyEdits(
    edits: EditBlock[],
    rootDir: string,
  ): Promise<{ applied: EditBlock[]; failed: { edit: EditBlock; reason: string }[] }> {
    const applied: EditBlock[] = [];
    const failed: { edit: EditBlock; reason: string }[] = [];

    for (const edit of edits) {
      try {
        const success = await this.applySingleEdit(edit, rootDir);
        if (success) {
          applied.push(edit);
        } else {
          failed.push({ edit, reason: 'SEARCH block did not exactly match file content' });
        }
      } catch (error) {
        failed.push({ edit, reason: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return { applied, failed };
  }

  /** 获取编辑应用的 diff 预览（CoreCoder 模式：成功时返回 diff，失败时返回原因） */
  async getEditDiff(
    edits: EditBlock[],
    rootDir: string,
  ): Promise<Array<{ path: string; diff: string; applied: boolean; reason?: string }>> {
    const diffs: Array<{ path: string; diff: string; applied: boolean; reason?: string }> = [];
    const fs = await import('fs/promises');
    const path = await import('path');

    for (const edit of edits) {
      const fullPath = path.isAbsolute(edit.path)
        ? edit.path
        : path.join(rootDir, edit.path);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const result = this.replaceContent(content, edit.original, edit.updated);
        if (result !== null) {
          // 生成统一 diff
          const originalLines = content.split('\n');
          const updatedLines = result.split('\n');
          const diff = this.generateUnifiedDiff(edit.path, originalLines, updatedLines);
          diffs.push({ path: edit.path, diff, applied: true });
        } else {
          diffs.push({ path: edit.path, diff: '', applied: false, reason: 'SEARCH block did not match' });
        }
      } catch {
        diffs.push({ path: edit.path, diff: '', applied: false, reason: 'File not found or unreadable' });
      }
    }
    return diffs;
  }

  private generateUnifiedDiff(filePath: string, original: string[], updated: string[]): string {
    const lines: string[] = [`--- ${filePath}`, `+++ ${filePath}`];
    let i = 0, j = 0;
    while (i < original.length || j < updated.length) {
      const oLine = original[i];
      const uLine = updated[j];
      if (i < original.length && j < updated.length && oLine === uLine) {
        lines.push(` ${oLine}`);
        i++; j++;
      } else {
        if (i < original.length) { lines.push(`-${oLine}`); i++; }
        if (j < updated.length) { lines.push(`+${uLine}`); j++; }
      }
    }
    return lines.join('\n');
  }

  // ------------------------------------------------------------------
  // 私有方法
  // ------------------------------------------------------------------

  private parseEditBlock(lines: string[], startIndex: number): EditBlock | null {
    const searchStart = startIndex + 1;
    let dividerIndex = -1;
    let replaceEnd = -1;

    // 找 ======= 分隔符
    for (let i = searchStart; i < lines.length; i++) {
      if (lines[i].trim() === '=======') {
        dividerIndex = i;
        break;
      }
    }
    if (dividerIndex === -1) return null;

    // 找 >>>>>>> REPLACE 结束标记
    for (let i = dividerIndex + 1; i < lines.length; i++) {
      if (lines[i].trim() === '>>>>>>> REPLACE') {
        replaceEnd = i;
        break;
      }
    }
    if (replaceEnd === -1) return null;

    // 提取文件名（在 SEARCH 标记前查找）
    let filePath = '';
    for (let i = searchStart - 2; i >= Math.max(0, searchStart - 5); i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('<') && !line.startsWith('=')) {
        filePath = line.replace(/^```\w*\s*/, '').replace(/```$/, '');
        break;
      }
    }

    const original = lines.slice(searchStart, dividerIndex).join('\n');
    const updated = lines.slice(dividerIndex + 1, replaceEnd).join('\n');

    return { path: filePath, original, updated, endIndex: replaceEnd + 1 };
  }

  private async applySingleEdit(edit: EditBlock, rootDir: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const fullPath = path.isAbsolute(edit.path)
      ? edit.path
      : path.join(rootDir, edit.path);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const newContent = this.replaceContent(content, edit.original, edit.updated);
      if (newContent !== null) {
        await fs.writeFile(fullPath, newContent, 'utf-8');
        return true;
      }
    } catch {
      // 文件不存在或无法读取
    }

    // 回退：查找相似文件名
    if (!path.isAbsolute(edit.path)) {
      try {
        const similar = findSimilarFile(edit.path);
        if (similar) {
          const content = await fs.readFile(similar, 'utf-8');
          const newContent = this.replaceContent(content, edit.original, edit.updated);
          if (newContent !== null) {
            await fs.writeFile(similar, newContent, 'utf-8');
            return true;
          }
        }
      } catch {
        // 忽略
      }
    }

    return false;
  }

  private replaceContent(content: string, before: string, after: string): string | null {
    // 精确匹配（仅替换第一个出现）
    if (before.trim() && content.includes(before)) {
      return content.replace(before, after);
    }

    // 空 before：追加到文件末尾
    if (!before.trim()) {
      if (!content.endsWith('\n')) {
        content += '\n';
      }
      return content + after;
    }

    // 模糊匹配：忽略首尾空白差异
    const result = this.fuzzyReplace(content, before, after);
    if (result !== null) return result;

    return null;
  }

  private fuzzyReplace(content: string, before: string, after: string): string | null {
    const contentLines = content.split('\n');
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    // 逐行模糊匹配（忽略首尾空白）
    for (let i = 0; i <= contentLines.length - beforeLines.length; i++) {
      if (this.linesMatchFuzzy(contentLines.slice(i, i + beforeLines.length), beforeLines)) {
        return [
          ...contentLines.slice(0, i),
          ...afterLines,
          ...contentLines.slice(i + beforeLines.length),
        ].join('\n');
      }
    }

    return null;
  }

  private linesMatchFuzzy(actual: string[], expected: string[]): boolean {
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i].trim() !== expected[i].trim()) return false;
    }
    return true;
  }
}

/** 便捷工厂函数 */
export function createEditBlockCoder(): EditBlockCoder {
  return new EditBlockCoder();
}
