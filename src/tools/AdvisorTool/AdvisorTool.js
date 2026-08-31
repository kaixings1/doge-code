import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    query: z.string().optional().describe('向顾问提出的查询问题'),
    focus: z.enum(['code', 'architecture', 'performance', 'security']).optional().describe('关注领域'),
    path: z.string().optional().describe('要分析的文件或目录路径'),
}));
const outputSchema = lazySchema(() => z.object({
    advice: z.string().describe('顾问建议'),
    suggestions: z.array(z.string()).describe('建议列表'),
    confidence: z.number().describe('置信度 (0-1)'),
    details: z.record(z.unknown()).optional().describe('分析详情'),
}));
export async function analyzeCodebase(path) {
    const result = {
        filesAnalyzed: 0,
        totalLines: 0,
        functions: 0,
        classes: 0,
        avgComplexity: 0,
        maxComplexity: 0,
        todoCount: 0,
        fixmeCount: 0,
        longFunctions: [],
        largeFiles: [],
    };
    if (!path)
        return result;
    try {
        const { readdir, stat, readFile } = await import('fs/promises');
        const { join, extname, relative } = await import('path');
        const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
        const complexities = [];
        let dirPath = path;
        try {
            const s = await stat(dirPath);
            if (!s.isDirectory()) {
                dirPath = join(process.cwd(), 'src');
            }
        }
        catch {
            dirPath = join(process.cwd(), 'src');
        }
        async function walk(dir, depth = 0) {
            if (depth > 3)
                return;
            let entries;
            try {
                entries = await readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    await walk(fullPath, depth + 1);
                }
                else if (entry.isFile() && codeExtensions.includes(extname(entry.name))) {
                    try {
                        const content = await readFile(fullPath, { encoding: 'utf8' });
                        const lines = content.split('\n');
                        result.totalLines += lines.length;
                        result.filesAnalyzed++;
                        result.todoCount += (content.match(/\/\/\s*TODO/gi) ?? []).length;
                        result.fixmeCount += (content.match(/\/\/\s*FIXME/gi) ?? []).length;
                        if (lines.length > 300) {
                            result.largeFiles.push({ path: relative(process.cwd(), fullPath), lines: lines.length });
                        }
                        // 函数/方法检测
                        const funcMatches = content.match(/(?:function\s+\w+|async\s+\w+\s*\(|=>\s*\{|\w+\s*\([^)]*\)\s*\{)/g);
                        if (funcMatches) {
                            result.functions += funcMatches.length;
                            for (const fn of funcMatches) {
                                const start = content.indexOf(fn);
                                if (start >= 0) {
                                    const block = content.slice(start, start + 200);
                                    const braceCount = (block.match(/\{/g) ?? []).length - (block.match(/\}/g) ?? []).length;
                                    const roughLines = block.split('\n').length;
                                    const complexity = Math.max(1, Math.floor(roughLines / 8));
                                    complexities.push(complexity);
                                    if (roughLines > 50) {
                                        result.longFunctions.push(`${relative(process.cwd(), fullPath)}: ~${roughLines} lines (complexity ~${complexity})`);
                                    }
                                }
                            }
                        }
                        // 类检测
                        const classMatches = content.match(/class\s+\w+/g);
                        if (classMatches) {
                            result.classes += classMatches.length;
                        }
                    }
                    catch {
                        // skip unreadable files
                    }
                }
            }
        }
        await walk(dirPath);
        if (complexities.length > 0) {
            const sum = complexities.reduce((a, b) => a + b, 0);
            result.avgComplexity = Number((sum / complexities.length).toFixed(1));
            result.maxComplexity = Math.max(...complexities);
        }
    }
    catch {
        // analysis failed silently
    }
    return result;
}
export function generateAdvice(focus, analysis) {
    const suggestions = [];
    let confidence = 0.85;
    if (analysis.filesAnalyzed === 0) {
        return {
            advice: '未分析到代码文件。请提供有效路径或确保项目在 src/ 目录下。',
            suggestions: ['提供要分析的文件或目录路径', '确保项目包含可识别的源代码文件'],
            confidence: 0.3,
        };
    }
    switch (focus) {
        case 'code': {
            if (analysis.longFunctions.length > 0) {
                suggestions.push(`发现 ${analysis.longFunctions.length} 个过长函数，建议拆分为更小的单元`);
            }
            if (analysis.todoCount > 10) {
                suggestions.push(`有 ${analysis.todoCount} 个 TODO 注释，建议逐一处理或转存为 issue`);
            }
            if (analysis.fixmeCount > 0) {
                suggestions.push(`发现 ${analysis.fixmeCount} 个 FIXME 注释，应优先修复`);
            }
            if (analysis.maxComplexity > 15) {
                suggestions.push(`最大圈复杂度为 ${analysis.maxComplexity}，超过阈值 15，建议重构高复杂度函数`);
            }
            confidence = Math.min(0.95, 0.5 + analysis.filesAnalyzed * 0.05);
            break;
        }
        case 'performance': {
            if (analysis.largeFiles.length > 0) {
                suggestions.push(`发现 ${analysis.largeFiles.length} 个大文件（>300行），建议拆分`);
            }
            if (analysis.avgComplexity > 8) {
                suggestions.push(`平均圈复杂度 ${analysis.avgComplexity}，偏高的复杂度会影响 JIT 优化`);
            }
            confidence = 0.7;
            break;
        }
        case 'security': {
            if (analysis.todoCount + analysis.fixmeCount > 5) {
                suggestions.push('遗留注释较多，可能包含未修复的安全问题');
            }
            suggestions.push('建议结合专门的安全扫描工具进行深度检测');
            confidence = 0.5;
            break;
        }
        case 'architecture':
        default: {
            if (analysis.filesAnalyzed > 20) {
                suggestions.push('项目规模较大，建议按模块/领域划分代码结构');
            }
            if (analysis.classes === 0 && analysis.filesAnalyzed > 5) {
                suggestions.push('未检测到类定义，确认是否使用了面向对象设计');
            }
            confidence = 0.6;
            break;
        }
    }
    const advice = suggestions.length > 0
        ? `分析了 ${analysis.filesAnalyzed} 个文件（${analysis.totalLines} 行），发现 ${suggestions.length} 个改进点。`
        : `分析了 ${analysis.filesAnalyzed} 个文件，未发现明显问题。`;
    return { advice, suggestions, confidence };
}
export const AdvisorTool = buildTool({
    name: 'advisor',
    description: async () => 'AI 代码分析与建议（复杂度/架构/性能/安全）',
    callOn: 'manual',
    async prompt() {
        return '使用 advisor 工具分析代码库并提供改进建议。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'advisor';
    },
    isEnabled() {
        return true;
    },
    toAutoClassifierInput() {
        return '';
    },
    async checkPermissions(input) {
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage(input) {
        const focus = input?.focus ?? 'code';
        return `Advisor: ${focus} analysis`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.advice || '分析完成',
        };
    },
    async call({ query, focus = 'code', path }) {
        const analysis = await analyzeCodebase(path);
        const { advice, suggestions, confidence } = generateAdvice(focus, analysis);
        const details = {
            filesAnalyzed: analysis.filesAnalyzed,
            totalLines: analysis.totalLines,
            functions: analysis.functions,
            classes: analysis.classes,
            avgComplexity: analysis.avgComplexity,
            maxComplexity: analysis.maxComplexity,
            todoCount: analysis.todoCount,
            fixmeCount: analysis.fixmeCount,
        };
        if (analysis.longFunctions.length > 0) {
            details.longFunctions = analysis.longFunctions.slice(0, 10);
        }
        if (analysis.largeFiles.length > 0) {
            details.largeFiles = analysis.largeFiles.slice(0, 10);
        }
        return {
            data: {
                advice: query ? `${advice} 查询: "${query}"` : advice,
                suggestions,
                confidence,
                details,
            },
        };
    },
});
