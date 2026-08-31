import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, resolve, extname } from 'path';
const ALLOWED_TOOLS = [
    'Bash(*)',
    'FileRead(*)',
    'FileEdit(*)',
    'FileWrite(*)',
    'MultiFileEdit(*)',
    'Glob(*)',
    'Grep(*)',
];
function analyzeCodeFile(filePath) {
    if (!existsSync(filePath))
        return null;
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const ext = extname(filePath).toLowerCase();
        const functions = [];
        const classes = [];
        const imports = [];
        const exports = [];
        const issues = [];
        // 通用正则（支持 TS/JS/Python/Go/Java/Rust）
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            // 检测 import/use/require/include
            const importMatch = line.match(/^(?:import|use|require|include|from)\s+['"]?([^'"\s;]+)/);
            if (importMatch)
                imports.push(importMatch[1]);
            // 检测 export
            if (/^(export|pub\s+fn|pub\s+struct|pub\s+enum)/.test(line)) {
                const expMatch = line.match(/(?:export\s+(?:default\s+)?|pub\s+(?:fn|struct|enum)\s+)(\w+)/);
                if (expMatch)
                    exports.push(expMatch[1]);
            }
            // 检测函数/方法
            const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+|func\s+|fn\s+|pub\s+fn\s+)?(\w+)\s*\(([^)]*)\)/);
            if (funcMatch && !line.includes('//') && !line.includes('/*')) {
                const params = funcMatch[2] ? funcMatch[2].split(',').map(p => p.trim().split(/[:=]/)[0].trim()).filter(Boolean) : [];
                functions.push({
                    name: funcMatch[1],
                    line: lineNum,
                    length: 0, // 后续计算
                    params,
                    hasReturnType: /(?::|->\s*\w+)/.test(line),
                    isAsync: line.includes('async'),
                });
            }
            // 检测类/结构体
            const classMatch = line.match(/^(?:export\s+)?(?:class\s+|struct\s+|pub\s+struct\s+|impl\s+)(\w+)/);
            if (classMatch) {
                classes.push({ name: classMatch[1], line: lineNum, methods: [], properties: [] });
            }
        }
        // 计算函数长度和复杂度
        for (let i = 0; i < functions.length; i++) {
            const func = functions[i];
            const startLine = func.line;
            const endLine = i < functions.length - 1 ? functions[i + 1].line - 1 : lines.length;
            func.length = endLine - startLine;
            // 简单复杂度计算
            let complexity = 0;
            for (let j = startLine; j < endLine && j < lines.length; j++) {
                const l = lines[j];
                if (/\b(if|else|for|while|switch|catch|&&|\?)\b/.test(l))
                    complexity++;
            }
            // 生成重构建议
            if (func.length > 50) {
                issues.push({
                    type: 'extract',
                    severity: 'high',
                    file: filePath,
                    line: func.line,
                    message: `函数 "${func.name}" 过长 (${func.length} 行)`,
                    suggestion: `将 "${func.name}" 拆分为多个子函数`,
                    autoFixable: false,
                });
            }
            if (func.params.length > 5) {
                issues.push({
                    type: 'extract',
                    severity: 'medium',
                    file: filePath,
                    line: func.line,
                    message: `函数 "${func.name}" 参数过多 (${func.params.length} 个)`,
                    suggestion: `将参数封装为对象/接口`,
                    autoFixable: false,
                });
            }
            if (complexity > 10) {
                issues.push({
                    type: 'optimize',
                    severity: 'medium',
                    file: filePath,
                    line: func.line,
                    message: `函数 "${func.name}" 圈复杂度过高 (${complexity})`,
                    suggestion: `简化条件逻辑，使用提前返回或策略模式`,
                    autoFixable: false,
                });
            }
        }
        // 检测重复代码（简单：相同行数 > 5 的连续行）
        const lineMap = new Map();
        for (let i = 0; i < lines.length - 3; i++) {
            const block = lines.slice(i, i + 3).map(l => l.trim()).join('\n');
            if (block.length < 20)
                continue;
            if (!lineMap.has(block))
                lineMap.set(block, []);
            lineMap.get(block).push(i + 1);
        }
        for (const [block, positions] of lineMap) {
            if (positions.length >= 2 && !block.includes('import') && !block.includes('//')) {
                issues.push({
                    type: 'deduplicate',
                    severity: 'low',
                    file: filePath,
                    line: positions[0],
                    message: `发现重复代码 (出现在行 ${positions.join(', ')})`,
                    suggestion: `提取重复代码为共享函数`,
                    autoFixable: false,
                });
            }
        }
        // 计算整体复杂度
        const totalComplexity = lines.reduce((sum, line) => {
            return sum + (/\b(if|else|for|while|switch|catch|&&|\?|match|=>)\b/.test(line) ? 1 : 0);
        }, 0);
        return {
            file: filePath,
            lines: lines.length,
            functions,
            classes,
            imports,
            exports,
            complexity: totalComplexity,
            issues: issues.slice(0, 20), // 限制建议数量
        };
    }
    catch {
        return null;
    }
}
function analyzeProjectMetrics(projectPath) {
    const results = [];
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rs'];
    const scan = (dir) => {
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build')
                    continue;
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(fullPath);
                }
                else if (entry.isFile() && exts.includes(extname(entry.name))) {
                    const m = analyzeCodeFile(fullPath);
                    if (m)
                        results.push(m);
                }
            }
        }
        catch { /* ignore */ }
    };
    scan(projectPath);
    return results;
}
// ─── 重构命令实现 ───────────────────────────────────────────
function getPromptContent(args) {
    const firstArg = (args || '').trim().split(/\s+/)[0] || '';
    const rest = (args || '').trim().split(/\s+/).slice(1).join(' ');
    const extractMode = firstArg === 'extract';
    const renameMode = firstArg === 'rename';
    const extractFileMode = firstArg === 'extract-file';
    const optimizeMode = firstArg === 'optimize';
    let modeGuide = '';
    if (extractMode) {
        modeGuide = '提取重构：从代码中提取函数/类/模块\n目标: ' + (rest || '需要指定') + '\n1.识别要提取的代码块 2.创建新文件 3.用调用替换原代码 4.更新所有引用 5.运行编译检查';
    }
    else if (renameMode) {
        modeGuide = '重命名重构：重命名符号并更新所有引用\n目标: ' + (rest || '需要指定 old -> new') + '\n1.grep搜索所有引用 2.MultiFileEdit同时更新 3.运行编译检查';
    }
    else if (extractFileMode) {
        modeGuide = '提取文件：将大文件拆分为多个小文件\n目标: ' + (rest || '需要指定文件') + '\n1.分析导出项 2.按职责分组 3.创建新文件维护import链 4.源文件改为re-export';
    }
    else if (optimizeMode) {
        modeGuide = '性能优化：分析代码性能瓶颈\n检查: 循环嵌套、重复计算、大对象拷贝、N+1查询\n目标: ' + (rest || '需要指定文件');
    }
    else {
        modeGuide = '可用操作:\n- extract <源文件> <新函数> - 提取函数/类\n- rename <旧名> -> <新名> - 重命名符号\n- extract-file <文件> - 拆分大文件\n- optimize <文件> - 性能优化\n- <自由描述> - 自定义需求';
    }
    return `## 任务：代码重构

你是一个代码重构专家。分析并重构代码，提高代码质量、可维护性和性能，保持功能不变。

### 重构类型
${modeGuide}

### 通用重构步骤
1. 分析代码：读取目标文件，理解结构和功能
2. 制定计划：列出需要做的变更和受影响的文件
3. 执行重构：保持代码语义不变
4. 验证：运行编译检查和已有测试

### 重要原则
- 重构不改变外部行为
- 保持向后兼容
- 每次只做一种重构
- 完成后清除旧的/冗余的代码`;
}
// ─── 自动分析命令实现 ───────────────────────────────────────
function runAutoAnalyze(target) {
    const absPath = resolve(target);
    if (!existsSync(absPath)) {
        return `❌ 路径不存在: ${target}`;
    }
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
        const metrics = analyzeProjectMetrics(absPath);
        if (metrics.length === 0) {
            return '📊 未找到可分析的代码文件';
        }
        const totalIssues = metrics.reduce((s, m) => s + m.issues.length, 0);
        const totalLines = metrics.reduce((s, m) => s + m.lines, 0);
        const totalFuncs = metrics.reduce((s, m) => s + m.functions.length, 0);
        const totalClasses = metrics.reduce((s, m) => s + m.classes.length, 0);
        const avgComplexity = Math.round(metrics.reduce((s, m) => s + m.complexity, 0) / metrics.length);
        const lines = [
            '📊 项目重构分析报告',
            '═══════════════════════════════════════',
            '',
            `扫描文件: ${metrics.length}`,
            `总行数: ${totalLines}`,
            `函数数: ${totalFuncs}`,
            `类数: ${totalClasses}`,
            `平均圈复杂度: ${avgComplexity}`,
            `发现问题: ${totalIssues}`,
            '',
        ];
        // 按严重程度排序的 Top 问题
        const allIssues = metrics.flatMap(m => m.issues).sort((a, b) => {
            const w = { high: 3, medium: 2, low: 1 };
            return (w[b.severity] || 0) - (w[a.severity] || 0);
        });
        if (allIssues.length > 0) {
            lines.push('🔴 优先重构项 (Top 15):');
            allIssues.slice(0, 15).forEach((issue, i) => {
                const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🔵';
                lines.push(`  ${icon} ${i + 1}. [${issue.type}] ${issue.message}`);
                lines.push(`     ${issue.suggestion}`);
            });
            lines.push('');
        }
        // 文件健康度排行
        const sorted = [...metrics].sort((a, b) => b.complexity - a.complexity);
        lines.push('📁 最需要重构的文件 (Top 10):');
        sorted.slice(0, 10).forEach((m, i) => {
            const score = Math.max(0, 100 - m.complexity * 2 - m.issues.length * 5);
            const icon = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
            lines.push(`  ${icon} ${i + 1}. ${m.file} (${m.lines}行, 复杂度:${m.complexity}, 问题:${m.issues.length}, 评分:${score})`);
        });
        return lines.join('\n');
    }
    else {
        const m = analyzeCodeFile(absPath);
        if (!m)
            return '❌ 无法分析文件';
        const lines = [
            '📊 文件重构分析',
            '═══════════════════════════════════════',
            '',
            `文件: ${m.file}`,
            `行数: ${m.lines}`,
            `函数: ${m.functions.length}`,
            `类: ${m.classes.length}`,
            `导入: ${m.imports.length}`,
            `导出: ${m.exports.length}`,
            `圈复杂度: ${m.complexity}`,
            '',
        ];
        if (m.functions.length > 0) {
            lines.push('📋 函数列表:');
            m.functions.forEach(f => {
                const lenWarning = f.length > 50 ? ' ⚠️过长' : '';
                lines.push(`  • ${f.name}() - 行${f.line}, ${f.length}行, ${f.params.length}参数${lenWarning}`);
            });
            lines.push('');
        }
        if (m.issues.length > 0) {
            lines.push('🔴 重构建议:');
            m.issues.forEach((issue, i) => {
                const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🔵';
                lines.push(`  ${icon} ${i + 1}. ${issue.message}`);
                lines.push(`     → ${issue.suggestion}`);
            });
        }
        else {
            lines.push('✅ 未发现需要重构的问题');
        }
        return lines.join('\n');
    }
}
// ─── 命令注册 ───────────────────────────────────────────────
const call = async (args) => {
    const s = (args || '').trim();
    const parts = s.split(/\s+/);
    const subcmd = parts[0]?.toLowerCase() || '';
    // 自动分析模式
    if (subcmd === 'analyze' || subcmd === 'analysis') {
        const target = parts.slice(1).join(' ') || '.';
        return { type: 'text', value: runAutoAnalyze(target) };
    }
    // 批量重构模式
    if (subcmd === 'batch') {
        const target = parts.slice(1).join(' ') || '.';
        const metrics = analyzeProjectMetrics(resolve(target));
        const autoFixable = metrics.flatMap(m => m.issues.filter(i => i.autoFixable));
        return {
            type: 'text',
            value: [
                '📊 批量重构分析',
                '═══════════════════════════════════════',
                '',
                `扫描文件: ${metrics.length}`,
                `可自动修复: ${autoFixable.length}`,
                `需手动重构: ${metrics.reduce((s, m) => s + m.issues.length, 0) - autoFixable.length}`,
                '',
                '💡 使用以下命令进行具体重构:',
                '  /refactor extract <文件> <函数名>  - 提取函数',
                '  /refactor rename <旧名> <新名>     - 重命名符号',
                '  /refactor extract-file <文件>      - 拆分大文件',
                '  /refactor optimize <文件>          - 性能优化',
                '',
                '或直接描述需求:',
                '  /refactor 把 src/utils.ts 中的 validate 函数提取出来',
            ].join('\n'),
        };
    }
    // 帮助
    if (subcmd === 'help' || subcmd === '') {
        return {
            type: 'text',
            value: [
                '🔧 智能代码重构',
                '',
                '📖 用法: ',
                '  /refactor analyze [路径]     自动分析代码质量，生成重构建议',
                '  /refactor batch [路径]       批量分析项目，统计可重构项',
                '  /refactor extract <文件> <函数>  提取函数/类到新文件',
                '  /refactor rename <旧名> <新名>   重命名符号并更新引用',
                '  /refactor extract-file <文件>    拆分大文件为多个模块',
                '  /refactor optimize <文件>        性能优化分析',
                '  /refactor <自由描述>            自定义重构需求',
                '',
                '支持语言: TypeScript, JavaScript, Python, Go, Java, Rust',
                '',
                '💡 示例: ',
                '  /refactor analyze src/',
                '  /refactor analyze src/utils/helper.ts',
                '  /refactor batch .',
                '  /refactor extract src/app.ts validateInput',
                '  /refactor rename oldName newName',
                '  /refactor 把循环改成函数式写法',
            ].join('\n'),
        };
    }
    // 其他模式：使用 prompt 引导 AI 进行重构
    return {
        type: 'text',
        value: getPromptContent(s),
    };
};
const command = {
    type: 'local',
    name: 'refactor',
    description: '智能代码重构：自动分析 + 提取/重命名/拆分/性能优化',
    aliases: ['/refactor', '/ref'],
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call: call }),
    call,
};
export default command;
